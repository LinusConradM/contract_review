// Verifies S3-compatible object storage credentials by round-tripping a small
// test object (put -> get -> delete). Run after filling in the S3_* vars:
//
//   node --env-file=.env scripts/check-storage.mjs
//
// Exits 0 on success, 1 on failure. Does NOT touch your real contract files.
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const {
  S3_BUCKET,
  S3_ENDPOINT,
  S3_REGION,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
} = process.env;

if (!S3_BUCKET) {
  console.error("✗ S3_BUCKET is not set — nothing to test.");
  process.exit(1);
}

const endpoint = S3_ENDPOINT || undefined;
const client = new S3Client({
  region: S3_REGION || "auto",
  endpoint,
  forcePathStyle: Boolean(endpoint),
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: S3_SECRET_ACCESS_KEY ?? "",
  },
});

const key = `healthcheck/${Date.now()}.txt`;
const body = "contract-review storage check";

try {
  console.log(`→ bucket: ${S3_BUCKET}`);
  console.log(`→ endpoint: ${endpoint ?? "(AWS default)"}`);

  await client.send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body })
  );
  console.log(`✓ put    ${key}`);

  const res = await client.send(
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key })
  );
  const got = await res.Body.transformToString();
  if (got !== body) throw new Error(`round-trip mismatch: got "${got}"`);
  console.log("✓ get    (contents match)");

  await client.send(
    new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })
  );
  console.log("✓ delete (cleaned up)");

  console.log("\n✅ Storage is configured correctly.");
} catch (err) {
  console.error("\n✗ Storage check FAILED:");
  console.error(`  ${err.name}: ${err.message}`);
  console.error(
    "\nCommon causes: wrong endpoint/account id, bad access keys, or the API\n" +
      "token isn't scoped to this bucket with Object Read & Write."
  );
  process.exit(1);
}
