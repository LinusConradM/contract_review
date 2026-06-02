import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const contracts = await prisma.contract.findMany({
    where: { userId: user.id },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      title: true,
      fileName: true,
      fileSize: true,
      status: true,
      pageCount: true,
      error: true,
      uploadedAt: true,
      _count: { select: { clauses: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    contracts: contracts.map(({ _count, ...c }) => ({
      ...c,
      clauseCount: _count.clauses,
    })),
  });
}
