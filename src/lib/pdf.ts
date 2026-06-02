export type PdfExtraction = {
  text: string;
  pageCount: number;
};

// Import the library entry point directly to avoid pdf-parse's index.js debug
// block, which tries to read a bundled test PDF when module.parent is undefined.
export async function extractPdfText(bytes: Buffer): Promise<PdfExtraction> {
  const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
  const result = await pdfParse(bytes);
  return {
    text: result.text.trim(),
    pageCount: result.numpages,
  };
}
