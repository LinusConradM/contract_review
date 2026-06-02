import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ReviewReport } from "@/lib/report";
import ReviewDashboard from "@/components/ReviewDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review contract — Contract Review",
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const contract = await prisma.contract.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      status: true,
      summary: { select: { content: true } },
      clauses: {
        select: {
          index: true,
          analysis: {
            select: {
              decision: { select: { approved: true, notes: true } },
            },
          },
        },
      },
    },
  });
  if (!contract) notFound();

  let report: ReviewReport | null = null;
  if (contract.summary?.content) {
    try {
      report = JSON.parse(contract.summary.content) as ReviewReport;
    } catch {
      report = null;
    }
  }

  const initialDecisions: Record<number, { approved: boolean; notes: string }> =
    {};
  for (const c of contract.clauses) {
    const dec = c.analysis?.decision;
    if (dec) {
      initialDecisions[c.index] = {
        approved: dec.approved,
        notes: dec.notes ?? "",
      };
    }
  }

  const awaiting = contract.status === "AWAITING_REVIEW";

  return (
    <main>
      <p className="subtitle">
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
      <h1>{contract.title}</h1>
      <p className="subtitle">
        Status: <strong>{contract.status.replace(/_/g, " ").toLowerCase()}</strong>
      </p>

      {!report ? (
        <p>No review report is available for this contract yet.</p>
      ) : (
        <>
          <section className="card">
            <h2>Summary</h2>
            <div className="report-stats">
              <span className="stat">
                <strong>{report.stats.analysedClauses}</strong> clauses
              </span>
              <span className="stat stat-high">
                <strong>
                  {report.stats.byRisk.CRITICAL + report.stats.byRisk.HIGH}
                </strong>{" "}
                high/critical
              </span>
              <span className="stat stat-med">
                <strong>{report.stats.byRisk.MEDIUM}</strong> medium
              </span>
              <span className="stat stat-low">
                <strong>{report.stats.byRisk.LOW}</strong> low
              </span>
              <span className="stat">
                <strong>{report.stats.clausesWithAmbiguity}</strong> with ambiguity
              </span>
              <span className="stat">
                <strong>{report.stats.totalRecommendations}</strong> recommendations
              </span>
            </div>
          </section>

          <ReviewDashboard
            contractId={contract.id}
            awaiting={awaiting}
            report={report}
            initialDecisions={initialDecisions}
          />
        </>
      )}
    </main>
  );
}
