import { NextResponse } from "next/server";
import { wait } from "@trigger.dev/sdk/v3";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type ReviewDecision = {
  approved: boolean;
  notes?: string;
  reviewer?: string;
};

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
    select: { id: true, status: true, reviewTokenId: true },
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
  if (!body || typeof body.approved !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "Body must include a boolean `approved`." },
      { status: 400 }
    );
  }

  const decision: ReviewDecision = {
    approved: body.approved,
    notes: typeof body.notes === "string" ? body.notes.trim() || undefined : undefined,
    reviewer: user.email,
  };

  // Completing the token resumes the suspended processContractUpload run.
  await wait.completeToken<ReviewDecision>(contract.reviewTokenId, decision);

  return NextResponse.json({ ok: true, decision });
}
