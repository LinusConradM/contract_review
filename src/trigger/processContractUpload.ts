import { logger, task, wait } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/db";
import { extractPdfText } from "@/lib/pdf";
import { readContractFile } from "@/lib/storage";
import { buildReviewReport } from "@/lib/report";
import { sendReviewReadyEmail } from "@/lib/email";
import { splitContractClauses } from "./splitContractClauses";
import { analyseClause } from "./analyseClause";

type ReviewDecision = {
  approved: boolean;
  notes?: string;
  reviewer?: string;
};

function dashboardUrl(contractId: string): string {
  const base = process.env.APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/contracts/${contractId}/review`;
}

export const processContractUpload = task({
  id: "process-contract-upload",
  maxDuration: 600,
  run: async (payload: { contractId: string }) => {
    const { contractId } = payload ?? {};
    if (!contractId) {
      throw new Error(
        "Missing contractId in payload. This task must be triggered from the upload route, not run with an empty payload."
      );
    }
    logger.log("Processing contract upload", { contractId });

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    await prisma.contract.update({
      where: { id: contractId },
      data: { status: "EXTRACTING", error: null },
    });

    try {
      const bytes = await readContractFile(contract.storagePath);
      logger.log("Read PDF from storage", {
        storagePath: contract.storagePath,
        bytes: bytes.length,
      });

      const { text, pageCount } = await extractPdfText(bytes);
      logger.log("Extracted text", {
        pageCount,
        characters: text.length,
      });

      if (text.length === 0) {
        logger.warn(
          "Extraction produced no text — the PDF may be scanned/image-only"
        );
      }

      await prisma.contract.update({
        where: { id: contractId },
        data: {
          extractedText: text,
          pageCount,
          status: "EXTRACTED",
        },
      });

      // Hand off to the clause-splitting child task; it appears as its own
      // step in the run timeline and advances the contract to SPLIT.
      const split = await splitContractClauses.triggerAndWait({ contractId });
      if (!split.ok) {
        throw new Error("Clause splitting failed");
      }

      // Analyse every clause in parallel. Each clause becomes its own child run;
      // the queue concurrencyLimit on analyseClause throttles LLM calls.
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: "ANALYZING" },
      });

      const clauses = await prisma.clause.findMany({
        where: { contractId },
        orderBy: { index: "asc" },
        select: { id: true, text: true },
      });

      const batch = await analyseClause.batchTriggerAndWait(
        clauses.map((clause) => ({
          payload: { clauseId: clause.id, text: clause.text },
        }))
      );

      const failed = batch.runs.filter((r) => !r.ok).length;
      if (failed > 0) {
        throw new Error(
          `${failed} of ${clauses.length} clause analyses failed`
        );
      }

      // Aggregate the per-clause analyses into a single structured report,
      // grouped by risk level (highest first), and persist it.
      const analysed = await prisma.clause.findMany({
        where: { contractId },
        orderBy: { index: "asc" },
        select: {
          index: true,
          text: true,
          analysis: {
            select: {
              riskLevel: true,
              explanation: true,
              ambiguousTerms: true,
              recommendations: true,
            },
          },
        },
      });

      const report = buildReviewReport(analysed);
      await prisma.contractSummary.upsert({
        where: { contractId },
        create: { contractId, content: JSON.stringify(report) },
        update: { content: JSON.stringify(report) },
      });
      logger.log("Built review report", { contractId, stats: report.stats });

      // Create a waitpoint token. The run suspends at wait.forToken() below
      // until someone completes this token from the review dashboard. No
      // timeout — the task checkpoints and frees compute while it waits.
      const token = await wait.createToken({ tags: [`contract:${contractId}`] });
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: "AWAITING_REVIEW", reviewTokenId: token.id },
      });

      // Notify the owner before suspending, with a link to the dashboard.
      const owner = await prisma.user.findUnique({
        where: { id: contract.userId },
        select: { email: true, name: true },
      });
      if (owner) {
        const email = await sendReviewReadyEmail({
          to: owner.email,
          recipientName: owner.name,
          contractTitle: contract.title,
          dashboardUrl: dashboardUrl(contractId),
          stats: {
            totalClauses: report.stats.totalClauses,
            byRisk: report.stats.byRisk,
            clausesWithAmbiguity: report.stats.clausesWithAmbiguity,
            totalRecommendations: report.stats.totalRecommendations,
          },
        });
        logger.log("Review-ready email dispatched", {
          contractId,
          provider: email.provider,
          sent: email.sent,
        });
      }

      logger.log("Suspending for human review", {
        contractId,
        tokenId: token.id,
      });
      const review = await wait.forToken<ReviewDecision>(token);
      if (!review.ok) {
        throw review.error;
      }
      const decision = review.output;
      logger.log("Review token completed", { contractId, decision });

      await prisma.contract.update({
        where: { id: contractId },
        data: {
          status: "COMPLETED",
          error: decision.approved
            ? null
            : `Changes requested${decision.notes ? `: ${decision.notes}` : ""}`,
        },
      });

      return {
        contractId,
        pageCount,
        characters: text.length,
        clauseCount: split.output.clauseCount,
        analysedClauses: clauses.length,
        stats: report.stats,
        decision,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "PDF extraction failed";
      logger.error("Extraction failed", { contractId, message });

      await prisma.contract.update({
        where: { id: contractId },
        data: { status: "FAILED", error: message },
      });

      throw error;
    }
  },
});
