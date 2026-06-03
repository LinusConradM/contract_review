import { logger, metadata, tags, task } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/db";
import { analyseClauseText } from "@/lib/analysis";

export const analyseClause = task({
  id: "analyse-clause",
  maxDuration: 120,
  // Exponential backoff absorbs transient LLM failures (rate limits, 5xx).
  retry: {
    maxAttempts: 5,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  // Cap concurrent LLM calls so a large fan-out doesn't trip provider rate limits.
  queue: { concurrencyLimit: 5 },
  run: async (payload: { clauseId: string; text: string }) => {
    const { clauseId, text } = payload ?? {};
    if (!clauseId) {
      throw new Error("Missing clauseId in payload.");
    }
    if (!text || text.trim().length === 0) {
      throw new Error(`Clause ${clauseId} has no text to analyse`);
    }

    const analysis = await analyseClauseText(text);
    logger.log("Analysed clause", {
      clauseId,
      riskLevel: analysis.riskLevel,
      ambiguousTerms: analysis.ambiguousTerms.length,
      provider: analysis.provider,
      model: analysis.model,
      finishReason: analysis.finishReason,
      totalTokens: analysis.usage.totalTokens,
    });

    // Tag the child run with the provider that served it and the risk band it
    // landed in — both useful dashboard filters (e.g. "all high-risk clauses",
    // "everything analysed by gemini").
    await tags.add([
      `provider:${analysis.provider}`,
      `risk:${analysis.riskLevel.toLowerCase()}`,
    ]);
    metadata.set("riskLevel", analysis.riskLevel);
    metadata.set("provider", analysis.provider);
    metadata.set("model", analysis.model);
    metadata.set("ambiguousTerms", analysis.ambiguousTerms.length);
    metadata.set("recommendations", analysis.recommendations.length);
    metadata.set("totalTokens", analysis.usage.totalTokens);

    const fields = {
      riskLevel: analysis.riskLevel,
      explanation: analysis.explanation,
      ambiguousTerms: analysis.ambiguousTerms,
      recommendations: analysis.recommendations,
      provider: analysis.provider,
      model: analysis.model,
      finishReason: analysis.finishReason,
      promptTokens: analysis.usage.promptTokens,
      completionTokens: analysis.usage.completionTokens,
      totalTokens: analysis.usage.totalTokens,
      rawResponse: analysis.raw,
    };

    // clauseId is @unique, so upsert keeps retries idempotent.
    await prisma.clauseAnalysis.upsert({
      where: { clauseId },
      create: { clauseId, ...fields },
      update: fields,
    });

    return { clauseId, riskLevel: analysis.riskLevel };
  },
});
