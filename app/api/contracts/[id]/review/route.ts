import { NextResponse } from "next/server";
import { wait } from "@trigger.dev/sdk/v3";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ClauseDecision, ReviewDecision } from "@/lib/review";

export const dynamic = "force-dynamic";

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
    select: {
      id: true,
      status: true,
      reviewTokenId: true,
      clauses: {
        orderBy: { index: "asc" },
        select: { index: true, analysis: { select: { id: true } } },
      },
    },
  });
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (!contract.reviewTokenId) {
    return NextResponse.json(
      { ok: false, error: "This contract is not awaiting review." },
      { status: 409 }
    );
  }
  if (contract.status !== "AWAITING_REVIEW") {
    return NextResponse.json(
      { ok: false, error: `Contract is ${contract.status.toLowerCase()}, not awaiting review.` },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  const rawDecisions: unknown = body?.decisions;
  if (!Array.isArray(rawDecisions)) {
    return NextResponse.json(
      { ok: false, error: "Body must include a `decisions` array." },
      { status: 400 }
    );
  }

  // Map analysed clauses by index, and validate every one has a decision.
  const analysisByIndex = new Map<number, string>();
  for (const c of contract.clauses) {
    if (c.analysis) analysisByIndex.set(c.index, c.analysis.id);
  }

  const decisions: ClauseDecision[] = [];
  const seen = new Set<number>();
  for (const d of rawDecisions) {
    if (
      !d ||
      typeof d.clauseIndex !== "number" ||
      typeof d.approved !== "boolean"
    ) {
      return NextResponse.json(
        { ok: false, error: "Each decision needs a numeric `clauseIndex` and boolean `approved`." },
        { status: 400 }
      );
    }
    if (!analysisByIndex.has(d.clauseIndex)) continue;
    seen.add(d.clauseIndex);
    decisions.push({
      clauseIndex: d.clauseIndex,
      approved: d.approved,
      notes: typeof d.notes === "string" ? d.notes.trim() || undefined : undefined,
    });
  }

  const missing = [...analysisByIndex.keys()].filter((i) => !seen.has(i));
  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Review every clause before submitting. Still pending: ${missing
          .map((i) => `#${i}`)
          .join(", ")}.`,
        missing,
      },
      { status: 400 }
    );
  }

  // Persist all decisions, then complete the token in a single logical step.
  await prisma.$transaction(
    decisions.map((d) => {
      const analysisId = analysisByIndex.get(d.clauseIndex)!;
      const notes = d.notes ?? null;
      return prisma.reviewerDecision.upsert({
        where: { analysisId },
        create: { analysisId, approved: d.approved, notes },
        update: { approved: d.approved, notes, decidedAt: new Date() },
      });
    })
  );

  const decision: ReviewDecision = {
    approved: decisions.every((d) => d.approved),
    reviewer: user.email,
    notes: typeof body?.notes === "string" ? body.notes.trim() || undefined : undefined,
    decidedAt: new Date().toISOString(),
    clauses: decisions.sort((a, b) => a.clauseIndex - b.clauseIndex),
  };

  // Completing the token resumes the suspended processContractUpload run with
  // all of the reviewer's decisions available in its output.
  await wait.completeToken<ReviewDecision>(contract.reviewTokenId, decision);

  return NextResponse.json({ ok: true, decision });
}
