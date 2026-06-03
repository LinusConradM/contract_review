import { logger, metadata, task, wait } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/db";
import { extractDocument, kindFromStoragePath } from "@/lib/documents";
import { readContractFile } from "@/lib/storage";
import { buildReviewReport } from "@/lib/report";
import { sendReviewReadyEmail } from "@/lib/email";
import type { ReviewDecision } from "@/lib/review";
import { splitContractClauses } from "./splitContractClauses";
import { analyseClause } from "./analyseClause";
import { generateSummary } from "./generateSummary";
import { reviewReminder } from "./reviewReminder";

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

    // Seed run metadata. This structured object is visible in the dashboard's
    // run view and over the SDK, and we mutate it as the workflow advances so
    // it always reflects the live stage and tallies.
    metadata.set("contractId", contractId);
    metadata.set("userId", contract.userId);
    metadata.set("stage", "extracting");
    metadata.set("errors", 0);

    await prisma.contract.update({
      where: { id: contractId },
      data: { status: "EXTRACTING", error: null },
    });

    try {
      const bytes = await readContractFile(contract.storagePath);
      const kind = kindFromStoragePath(contract.storagePath);
      logger.log("Read document from storage", {
        storagePath: contract.storagePath,
        kind,
        bytes: bytes.length,
      });
      metadata.set("documentKind", kind);

      const { text, pageCount } = await extractDocument(kind, bytes);
      logger.log("Extracted text", {
        kind,
        pageCount,
        characters: text.length,
      });
      metadata.set("pageCount", pageCount);
      metadata.set("characters", text.length);

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
      // step in the run timeline and advances the contract to SPLIT. Tags are
      // passed explicitly (they don't inherit) so the child is filterable too.
      metadata.set("stage", "splitting");
      const split = await splitContractClauses.triggerAndWait(
        { contractId },
        { tags: [`contract:${contractId}`, `user:${contract.userId}`, "stage:split"] }
      );
      if (!split.ok) {
        metadata.increment("errors", 1);
        throw new Error("Clause splitting failed");
      }
      metadata.set("clauses.total", split.output.clauseCount);

      // Analyse every clause in parallel. Each clause becomes its own child run;
      // the queue concurrencyLimit on analyseClause throttles LLM calls.
      metadata.set("stage", "analyzing");
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: "ANALYZING" },
      });

      const clauses = await prisma.clause.findMany({
        where: { contractId },
        orderBy: { index: "asc" },
        select: { id: true, index: true, text: true },
      });

      // The batch trigger view shows all of these parallel child runs at a
      // glance. Each carries the contract/user tags plus its clause number.
      const batch = await analyseClause.batchTriggerAndWait(
        clauses.map((clause) => ({
          payload: { clauseId: clause.id, text: clause.text },
          options: {
            tags: [
              `contract:${contractId}`,
              `user:${contract.userId}`,
              "stage:analysis",
              `clause:${clause.index}`,
            ],
          },
        }))
      );

      const failed = batch.runs.filter((r) => !r.ok).length;
      metadata.set("errors.clauseAnalysis", failed);
      if (failed > 0) {
        metadata.increment("errors", failed);
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

      // Surface the risk breakdown on the run so the dashboard shows, at a
      // glance, how many clauses landed in each risk band.
      metadata.set("clauses.analysed", report.stats.analysedClauses);
      metadata.set("risk", {
        critical: report.stats.byRisk.CRITICAL,
        high: report.stats.byRisk.HIGH,
        medium: report.stats.byRisk.MEDIUM,
        low: report.stats.byRisk.LOW,
      });
      metadata.set("clausesWithAmbiguity", report.stats.clausesWithAmbiguity);
      metadata.set("recommendations", report.stats.totalRecommendations);

      // Create a waitpoint token. The run suspends at wait.forToken() below
      // until someone completes this token from the review dashboard. No
      // timeout — the task checkpoints and frees compute while it waits.
      metadata.set("stage", "awaiting_review");
      metadata.set("review.status", "pending");
      const token = await wait.createToken({ tags: [`contract:${contractId}`] });
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: "AWAITING_REVIEW", reviewTokenId: token.id },
      });

      // Schedule a follow-up reminder as a separate, detached run (note:
      // trigger(), not triggerAndWait — this orchestration must not block on a
      // run that sleeps for a week). It checkpoints on wait.for() and only emails
      // if the contract is still unactioned when it wakes. The idempotency key
      // makes this safe if the parent retries.
      await reviewReminder.trigger(
        { contractId },
        {
          tags: [`contract:${contractId}`, `user:${contract.userId}`, "stage:reminder"],
          concurrencyKey: contract.userId,
          idempotencyKey: `review-reminder:${contractId}`,
        }
      );

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
      const rejected = decision.clauses.filter((c) => !c.approved);
      logger.log("Review token completed", {
        contractId,
        approved: decision.approved,
        reviewer: decision.reviewer,
        rejectedClauses: rejected.map((c) => c.clauseIndex),
      });
      metadata.set("review.status", decision.approved ? "approved" : "changes_requested");
      metadata.set("review.reviewer", decision.reviewer ?? null);
      metadata.set("review.rejectedClauses", rejected.length);

      // Synthesise the final memorandum from the analyses + reviewer decisions.
      // triggerAndWait so we get the generated document's metadata back here.
      metadata.set("stage", "summarizing");
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: "SUMMARIZING" },
      });
      const summary = await generateSummary.triggerAndWait(
        { contractId },
        { tags: [`contract:${contractId}`, `user:${contract.userId}`, "stage:summary"] }
      );
      if (!summary.ok) {
        metadata.increment("errors", 1);
        throw new Error("Final summary generation failed");
      }
      logger.log("Final summary generated", {
        contractId,
        provider: summary.output.provider,
        model: summary.output.model,
        characters: summary.output.characters,
      });
      metadata.set("summary.provider", summary.output.provider);
      metadata.set("summary.model", summary.output.model);
      metadata.set("summary.characters", summary.output.characters);
      metadata.set("summary.emailed", summary.output.emailed);

      metadata.set("stage", "completed");
      await prisma.contract.update({
        where: { id: contractId },
        data: {
          status: "COMPLETED",
          error: decision.approved
            ? null
            : `Changes requested on ${rejected.length} clause${
                rejected.length === 1 ? "" : "s"
              } (${rejected.map((c) => `#${c.clauseIndex}`).join(", ")})${
                decision.notes ? `: ${decision.notes}` : ""
              }`,
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
        summary: summary.output,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "PDF extraction failed";
      logger.error("Extraction failed", { contractId, message });
      metadata.set("stage", "failed");
      metadata.set("failureReason", message);
      metadata.increment("errors", 1);

      await prisma.contract.update({
        where: { id: contractId },
        data: { status: "FAILED", error: message },
      });

      throw error;
    }
  },
});
