import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const STORAGE_ROOT = path.resolve(process.cwd(), "storage", "contracts");

// Storage driver. In production the web app and the Trigger.dev workers run on
// separate machines with no shared disk, so uploaded files must live in shared
// object storage. We use an S3-compatible client, which works with AWS S3,
// Cloudflare R2, Supabase Storage, MinIO, etc. — set S3_BUCKET (+ endpoint/keys)
// to enable it. With no bucket configured we fall back to the local filesystem,
// which is fine for single-machine local development.
type StorageDriver = "s3" | "local";

function driver(): StorageDriver {
  return process.env.S3_BUCKET ? "s3" : "local";
}

function contentTypeForExt(ext: string): string {
  return ext === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/pdf";
}

// The object key (also the value persisted as Contract.storagePath in the S3
// case). It still ends in the original extension, so kindFromStoragePath() can
// recover the document kind from it just like a local path.
function objectKey(contractId: string, ext: string): string {
  return `contracts/${contractId}.${ext}`;
}

// Lazily construct an S3 client so local-dev runs never load the AWS SDK paths.
// `endpoint` is set for non-AWS providers (R2/Supabase/MinIO); when present we
// use path-style addressing, which those providers require.
async function s3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const endpoint = process.env.S3_ENDPOINT || undefined;
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
}

export async function saveContractFile(
  contractId: string,
  bytes: Buffer,
  // File extension (without dot), e.g. "pdf" or "docx". Persisted in the path
  // so the extraction step can recover the document kind later.
  ext = "pdf"
): Promise<string> {
  if (driver() === "s3") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const key = objectKey(contractId, ext);
    const client = await s3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: contentTypeForExt(ext),
      })
    );
    // Persist the object key; readContractFile resolves it back via the bucket.
    return key;
  }

  await mkdir(STORAGE_ROOT, { recursive: true });
  const filePath = path.join(STORAGE_ROOT, `${contractId}.${ext}`);
  await writeFile(filePath, bytes);
  return filePath;
}

export async function readContractFile(storagePath: string): Promise<Buffer> {
  // Absolute paths are local files (the local driver stores them that way, and
  // legacy rows predate object storage). Read them straight off disk regardless
  // of the active driver.
  if (path.isAbsolute(storagePath)) {
    return readFile(storagePath);
  }

  if (driver() === "s3") {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    const res = await client.send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: storagePath,
      })
    );
    if (!res.Body) {
      throw new Error(`Object not found in storage: ${storagePath}`);
    }
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  // Local driver, relative key: resolve under the storage root.
  return readFile(path.join(STORAGE_ROOT, storagePath));
}
