import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const STORAGE_ROOT = path.resolve(process.cwd(), "storage", "contracts");

export async function saveContractFile(
  contractId: string,
  bytes: Buffer,
  // File extension (without dot), e.g. "pdf" or "docx". Persisted in the path
  // so the extraction step can recover the document kind later.
  ext = "pdf"
): Promise<string> {
  await mkdir(STORAGE_ROOT, { recursive: true });
  const filePath = path.join(STORAGE_ROOT, `${contractId}.${ext}`);
  await writeFile(filePath, bytes);
  return filePath;
}

export async function readContractFile(storagePath: string): Promise<Buffer> {
  return readFile(storagePath);
}
