import type { processContractUpload } from "@/trigger/processContractUpload";
import { tasks } from "@trigger.dev/sdk/v3";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveContractFile } from "@/lib/storage";
import { detectDocumentKind, extensionForKind } from "@/lib/documents";

export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.(pdf|docx)$/i, "").trim() || fileName;
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "You must be signed in to upload contracts." },
      { status: 401 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "No file was provided." },
      { status: 400 }
    );
  }

  const hasAcceptedExt = /\.(pdf|docx)$/i.test(file.name);
  const acceptedType =
    file.type === "application/pdf" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (!acceptedType && !hasAcceptedExt) {
    return NextResponse.json(
      { ok: false, error: "Only PDF and Word (.docx) files are accepted." },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "File is too large (25 MB maximum)." },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Confirm the actual contents are a format we support (magic bytes), not just
  // a matching name or declared MIME type.
  const kind = detectDocumentKind(file.name, file.type, bytes);
  if (!kind) {
    return NextResponse.json(
      { ok: false, error: "That file is not a valid PDF or Word document." },
      { status: 400 }
    );
  }

  const contract = await prisma.contract.create({
    data: {
      title: titleFromFileName(file.name),
      fileName: file.name,
      fileSize: bytes.length,
      storagePath: "pending",
      status: "UPLOADED",
      userId: user.id,
    },
  });

  const storagePath = await saveContractFile(
    contract.id,
    bytes,
    extensionForKind(kind)
  );
  await prisma.contract.update({
    where: { id: contract.id },
    data: { storagePath },
  });

  try {
    const handle = await tasks.trigger<typeof processContractUpload>(
      "process-contract-upload",
      { contractId: contract.id },
      {
        // Tags make this run filterable in the Trigger.dev dashboard — by the
        // contract it belongs to and the user who owns it.
        tags: [`contract:${contract.id}`, `user:${user.id}`, "stage:orchestration"],
        // Multi-tenancy: each user gets their own isolated orchestration queue,
        // so one user's backlog can never starve another's. (The per-clause LLM
        // queue keeps its global limit deliberately, as a shared provider-rate
        // guard rather than a per-tenant one.)
        concurrencyKey: user.id,
      }
    );

    // Persist the run id so the review page can subscribe to its realtime
    // "summary-output" stream when the final memorandum is generated.
    await prisma.contract.update({
      where: { id: contract.id },
      data: { runId: handle.id },
    });

    return NextResponse.json({
      ok: true,
      contractId: contract.id,
      runId: handle.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start processing.";
    await prisma.contract.update({
      where: { id: contract.id },
      data: { status: "FAILED", error: `Could not start processing: ${message}` },
    });
    return NextResponse.json(
      { ok: false, error: "Uploaded, but processing could not be started." },
      { status: 502 }
    );
  }
}
