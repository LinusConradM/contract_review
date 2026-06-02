import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Autosave a single clause decision while the reviewer works. Persisting per
// clause means progress survives a reload and is independently verifiable in
// the DB before the final submit.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id, index } = await params;
  const clauseIndex = Number(index);
  if (!Number.isInteger(clauseIndex)) {
    return NextResponse.json(
      { ok: false, error: "Invalid clause index." },
      { status: 400 }
    );
  }

  const contract = await prisma.contract.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true },
  });
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (contract.status !== "AWAITING_REVIEW") {
    return NextResponse.json(
      { ok: false, error: "This contract is not awaiting review." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.approved !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "Body must include a boolean `approved`." },
      { status: 400 }
    );
  }
  const notes =
    typeof body.notes === "string" ? body.notes.trim() || null : null;

  const clause = await prisma.clause.findUnique({
    where: { contractId_index: { contractId: id, index: clauseIndex } },
    select: { analysis: { select: { id: true } } },
  });
  if (!clause?.analysis) {
    return NextResponse.json(
      { ok: false, error: "Clause has no analysis to decide on." },
      { status: 404 }
    );
  }

  await prisma.reviewerDecision.upsert({
    where: { analysisId: clause.analysis.id },
    create: { analysisId: clause.analysis.id, approved: body.approved, notes },
    update: { approved: body.approved, notes, decidedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
