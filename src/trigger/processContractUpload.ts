import { logger, task } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/db";
import { extractPdfText } from "@/lib/pdf";
import { readContractFile } from "@/lib/storage";

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

      return { contractId, pageCount, characters: text.length };
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
