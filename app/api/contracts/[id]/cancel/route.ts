import { NextResponse } from "next/server";
import { runs } from "@trigger.dev/sdk/v3";
import type { ContractStatus } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Statuses from which cancellation makes sense — anything still in flight.
const CANCELLABLE_STATUSES: ContractStatus[] = [
  "UPLOADED",
  "EXTRACTING",
  "EXTRACTED",
  "SPLITTING",
  "SPLIT",
  "ANALYZING",
  "AWAITING_REVIEW",
  "SUMMARIZING",
];
const CANCELLABLE = new Set<ContractStatus>(CANCELLABLE_STATUSES);

// Abort an in-progress contract review. Cancelling the parent run propagates to
// its in-flight children (e.g. the streaming generate-summary task), so this
// also aborts summary generation mid-stream.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const contract = await prisma.contract.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true, runId: true },
  });
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (!contract.runId) {
    return NextResponse.json(
      { ok: false, error: "This contract has no run to cancel." },
      { status: 409 }
    );
  }
  if (!CANCELLABLE.has(contract.status)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Contract is ${contract.status.toLowerCase()} and can no longer be cancelled.`,
      },
      { status: 409 }
    );
  }

  // Cancel the run first. If it had already finished, this is effectively a
  // no-op and the guarded updateMany below won't clobber a terminal status.
  try {
    await runs.cancel(contract.runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: `Could not cancel the run: ${message}` },
      { status: 502 }
    );
  }

  // Only flip to CANCELLED if the contract is still in a cancellable state —
  // guards against a race where the run completed an instant before we cancelled.
  const updated = await prisma.contract.updateMany({
    where: { id: contract.id, userId: user.id, status: { in: CANCELLABLE_STATUSES } },
    data: { status: "CANCELLED", error: "Cancelled by user." },
  });

  return NextResponse.json({ ok: true, cancelled: updated.count > 0 });
}
