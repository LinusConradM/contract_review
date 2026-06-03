import { logger, metadata, tags, task } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/db";
import { splitIntoClauses } from "@/lib/clauses";

export const splitContractClauses = task({
  id: "split-contract-clauses",
  maxDuration: 600,
  run: async (payload: { contractId: string }) => {
    const { contractId } = payload ?? {};
    if (!contractId) {
      throw new Error("Missing contractId in payload.");
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }
    if (!contract.extractedText || contract.extractedText.trim().length === 0) {
      throw new Error(`Contract ${contractId} has no extracted text to split`);
    }

    await prisma.contract.update({
      where: { id: contractId },
      data: { status: "SPLITTING", error: null },
    });

    try {
      const { clauses, provider, model, usedFallback } = await splitIntoClauses(
        contract.extractedText
      );
      logger.log("Split contract into clauses", {
        contractId,
        clauseCount: clauses.length,
        provider,
        model,
        usedFallback,
      });

      // Tag this run with the provider that actually served the request (after
      // any fallback) so you can filter, e.g., "all runs that hit groq".
      await tags.add(`provider:${provider}`);
      metadata.set("provider", provider);
      metadata.set("model", model);
      metadata.set("usedFallback", usedFallback);
      metadata.set("clauseCount", clauses.length);

      if (clauses.length === 0) {
        throw new Error("Clause splitting produced no clauses");
      }

      // Replace any existing clauses so retries are idempotent.
      await prisma.$transaction([
        prisma.clause.deleteMany({ where: { contractId } }),
        prisma.clause.createMany({
          data: clauses.map((text, i) => ({
            contractId,
            index: i + 1,
            text,
          })),
        }),
        prisma.contract.update({
          where: { id: contractId },
          data: { status: "SPLIT" },
        }),
      ]);

      return { contractId, clauseCount: clauses.length, provider, model };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Clause splitting failed";
      logger.error("Clause splitting failed", { contractId, message });
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: "FAILED", error: message },
      });
      throw error;
    }
  },
});
