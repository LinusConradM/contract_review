export type PdfExtraction = {
  text: string;
  pageCount: number;
};

// pdf-parse's bundled pdf.js has a cold-start bug: the first one or two parses
// in a fresh process can spuriously throw "bad XRef entry" on a perfectly valid
// PDF, then succeed on a retry. Retry a few times to absorb that warmup flake.
async function parseWithRetry(
  pdfParse: (b: Buffer) => Promise<{ text: string; numpages: number }>,
  bytes: Buffer,
  attempts = 4
): Promise<{ text: string; numpages: number }> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await pdfParse(bytes);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// Import the library entry point directly to avoid pdf-parse's index.js debug
// block, which tries to read a bundled test PDF when module.parent is undefined.
export async function extractPdfText(bytes: Buffer): Promise<PdfExtraction> {
  const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
  const result = await parseWithRetry(pdfParse, bytes);
  return {
    text: result.text.trim(),
    pageCount: result.numpages,
  };
}
