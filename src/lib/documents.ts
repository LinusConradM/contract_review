import { extractPdfText } from "./pdf";
import { extractDocxText } from "./docx";

// The contract file formats we accept. Add a new kind here, teach
// detectDocumentKind/extractDocument about it, and the rest of the pipeline
// (upload route, storage, extraction step) follows.
export type DocumentKind = "pdf" | "docx";

export type DocumentExtraction = {
  text: string;
  // PDFs report a page count; DOCX has no fixed pagination, so it's null.
  pageCount: number | null;
};

const PDF_MAGIC = "%PDF-";
// DOCX is a ZIP container, which starts with the local-file-header signature
// "PK\x03\x04". A bare ZIP signature isn't enough to call it a Word doc, so we
// additionally require the .docx extension or the Office MIME type.
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx"] as const;

// Decide what kind of document this is from its bytes + name + declared MIME
// type, or null if it isn't a format we support. Content (magic bytes) is the
// source of truth; the name/MIME disambiguate ZIP-based formats.
export function detectDocumentKind(
  fileName: string,
  mimeType: string,
  bytes: Buffer
): DocumentKind | null {
  const isPdfMagic = bytes.subarray(0, 5).toString("latin1") === PDF_MAGIC;
  if (isPdfMagic) return "pdf";

  const isZipMagic = ZIP_MAGIC.every((b, i) => bytes[i] === b);
  const looksDocx = /\.docx$/i.test(fileName) || mimeType === DOCX_MIME;
  if (isZipMagic && looksDocx) return "docx";

  return null;
}

// Map a kind to the file extension we persist it under, so the extraction step
// can recover the kind later from the stored path.
export function extensionForKind(kind: DocumentKind): string {
  return kind === "pdf" ? "pdf" : "docx";
}

export function kindFromStoragePath(storagePath: string): DocumentKind {
  return /\.docx$/i.test(storagePath) ? "docx" : "pdf";
}

// Unified extraction entry point — dispatches to the format-specific extractor.
export async function extractDocument(
  kind: DocumentKind,
  bytes: Buffer
): Promise<DocumentExtraction> {
  return kind === "docx" ? extractDocxText(bytes) : extractPdfText(bytes);
}
