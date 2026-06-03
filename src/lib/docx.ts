import type { DocumentExtraction } from "./documents";

// Extract plain text from a .docx (Office Open XML) document. mammoth walks the
// document body and returns the raw text; Word documents have no fixed page
// count (pagination is a render-time concern), so pageCount is null.
export async function extractDocxText(
  bytes: Buffer
): Promise<DocumentExtraction> {
  const { default: mammoth } = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: bytes });
  return {
    text: value.trim(),
    pageCount: null,
  };
}
