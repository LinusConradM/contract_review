import { logger, task } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/db";
import { generateFinalSummary } from "@/lib/summary";
import type { SummaryClauseInput } from "@/lib/summary";

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

    const summary = await generateFinalSummary({
      title: contract.title,
      clauses,
    });

    const approved = clauses.filter((c) => c.reviewer?.approved).length;
    const rejected = clauses.filter(
      (c) => c.reviewer && !c.reviewer.approved
    ).length;

    logger.log("Generated final summary", {
      contractId,
      provider: summary.provider,
      model: summary.model,
      finishReason: summary.finishReason,
      totalTokens: summary.usage.totalTokens,
      characters: summary.document.length,
      clauses: clauses.length,
      approved,
      rejected,
    });

    // The structured ContractSummary already exists from the pre-review report;
    // attach the final prose document without disturbing `content`.
    await prisma.contractSummary.upsert({
      where: { contractId },
      create: {
        contractId,
        content: "{}",
        finalReport: summary.document,
        finalReportProvider: summary.provider,
        finalReportModel: summary.model,
        finalReportAt: new Date(),
      },
      update: {
        finalReport: summary.document,
        finalReportProvider: summary.provider,
        finalReportModel: summary.model,
        finalReportAt: new Date(),
      },
    });

    return {
      contractId,
      provider: summary.provider,
      model: summary.model,
      characters: summary.document.length,
      clauses: clauses.length,
      approved,
      rejected,
    };
  },
});
