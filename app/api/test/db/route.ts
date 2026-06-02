import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const testEmail = `step-zero-${Date.now()}@test.local`;

  try {
    const passwordHash = await hashPassword("step-zero-test-only");
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash,
        name: "Step Zero Test User",
      },
    });

    const contract = await prisma.contract.create({
      data: {
        title: "Step Zero Test Contract",
        fileName: "test-agreement.pdf",
        userId: user.id,
        clauses: {
          create: [
            {
              index: 0,
              text: "The Provider shall indemnify the Client for all claims arising from the Services.",
            },
          ],
        },
      },
      include: { clauses: true },
    });

    const readBack = await prisma.contract.findUnique({
      where: { id: contract.id },
      include: { user: true, clauses: true },
    });

    await prisma.contract.delete({ where: { id: contract.id } });
    await prisma.user.delete({ where: { id: user.id } });

    return NextResponse.json({
      ok: true,
      message: "Database read/write verified (test data cleaned up)",
      created: {
        userId: user.id,
        contractId: contract.id,
        clauseCount: contract.clauses.length,
      },
      readBack: readBack
        ? {
            title: readBack.title,
            userEmail: readBack.user.email,
            clauseCount: readBack.clauses.length,
          }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Database test failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
