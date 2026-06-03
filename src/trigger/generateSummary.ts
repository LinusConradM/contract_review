import { logger, metadata, tags, task } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/db";
import { streamFinalSummary } from "@/lib/summary";
import type { SummaryClauseInput } from "@/lib/summary";
import { summaryStream } from "@/lib/streams";
import { sendSummaryEmail } from "@/lib/email";

export const generateSummary = task({
  id: "generate-summary",
  maxDuration: 180,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  run: async (payload: { contractId: string }) => {
    const { contractId } = payload ?? {};
    if (!contractId) {
      throw new Error("Missing contractId in payload.");
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        title: true,
        user: { select: { email: true, name: true } },
        clauses: {
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
                decision: {
                  select: { approved: true, notes: true },
                },
              },
            },
          },
        },
      },
    });

    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    const clauses: SummaryClauseInput[] = contract.clauses
      .filter((c) => c.analysis !== null)
      .map((c) => {
        const a = c.analysis!;
        return {
          number: c.index,
          text: c.text,
          riskLevel: a.riskLevel,
          explanation: a.explanation,
          ambiguousTerms: a.ambiguousTerms,
          recommendations: a.recommendations,
          reviewer: a.decision
            ? { approved: a.decision.approved, notes: a.decision.notes }
            : null,
        };
      });

    if (clauses.length === 0) {
      throw new Error(
        `Contract ${contractId} has no analysed clauses to summarise`
      );
    }

    // Stream the memorandum from the LLM token-by-token and pipe those tokens to
    // the realtime stream on the PARENT run (process-contract-upload), which is
    // the run the frontend subscribes to. The browser renders each token as it
    // arrives; refreshing replays the chunks already stored on the stream.
    const { textStream, completed, provider } = await streamFinalSummary({
      title: contract.title,
      clauses,
    });

    const { waitUntilComplete } = summaryStream.pipe(textStream, {
      target: "parent",
    });

    // Block until every token has been forwarded to the realtime stream.
    await waitUntilComplete();

    // `completed` resolves once the stream is fully consumed (which the pipe
    // above did), giving us the full document + standardised metadata.
    const result = await completed;
    const document = result.text.trim();
    if (!document) {
      throw new Error("LLM returned an empty summary document");
    }

    const approved = clauses.filter((c) => c.reviewer?.approved).length;
    const rejected = clauses.filter(
      (c) => c.reviewer && !c.reviewer.approved
    ).length;

    logger.log("Generated final summary (streamed)", {
      contractId,
      provider: result.provider,
      model: result.model,
      finishReason: result.finishReason,
      totalTokens: result.usage.totalTokens,
      characters: document.length,
      clauses: clauses.length,
      approved,
      rejected,
    });

    await tags.add(`provider:${result.provider}`);
    metadata.set("provider", result.provider);
    metadata.set("model", result.model);
    metadata.set("totalTokens", result.usage.totalTokens);
    metadata.set("characters", document.length);
    metadata.set("clauses", clauses.length);
    metadata.set("approved", approved);
    metadata.set("rejected", rejected);

    // The structured ContractSummary already exists from the pre-review report;
    // attach the final prose document without disturbing `content`.
    await prisma.contractSummary.upsert({
      where: { contractId },
      create: {
        contractId,
        content: "{}",
        finalReport: document,
        finalReportProvider: result.provider,
        finalReportModel: result.model,
        finalReportAt: new Date(),
      },
      update: {
        finalReport: document,
        finalReportProvider: result.provider,
        finalReportModel: result.model,
        finalReportAt: new Date(),
      },
    });

    // Alternative delivery channel: email the full memorandum once streaming is
    // done. Falls back to logging when RESEND_API_KEY is unset.
    const dashboardUrl = `${
      process.env.APP_URL || "http://localhost:3000"
    }/contracts/${contractId}/review`;
    let emailed = false;
    if (contract.user?.email) {
      try {
        const sent = await sendSummaryEmail({
          to: contract.user.email,
          recipientName: contract.user.name,
          contractTitle: contract.title,
          dashboardUrl,
          markdown: document,
        });
        emailed = sent.sent;
        logger.log("Summary email dispatched", {
          contractId,
          to: sent.to,
          provider: sent.provider,
          sent: sent.sent,
        });
      } catch (error) {
        // Email is a best-effort secondary channel — don't fail the run (and
        // lose the stored report) if delivery hiccups.
        logger.error("Failed to send summary email", {
          contractId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    metadata.set("emailed", emailed);

    return {
      contractId,
      provider: result.provider,
      model: result.model,
      characters: document.length,
      clauses: clauses.length,
      approved,
      rejected,
      streamedFrom: provider,
      emailed,
    };
  },
});
