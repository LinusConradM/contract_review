import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ReviewReport } from "@/lib/report";
import ReviewActions from "@/components/ReviewActions";

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

          {report.groups.map((group) => (
            <section key={group.riskLevel} className="card">
              <h2>
                <span className={`badge ${riskBadge(group.riskLevel)}`}>
                  {group.riskLevel.toLowerCase()} risk
                </span>{" "}
                · {group.clauses.length}{" "}
                {group.clauses.length === 1 ? "clause" : "clauses"}
              </h2>
              <ol className="report-clauses">
                {group.clauses.map((clause) => (
                  <li key={clause.number} className="report-clause">
                    <div className="report-clause-num">Clause {clause.number}</div>
                    <p className="report-clause-text">{clause.text}</p>
                    <p className="clause-explanation">{clause.explanation}</p>
                    {clause.ambiguousTerms.length > 0 && (
                      <p className="clause-tags">
                        <span className="clause-tags-label">Ambiguous:</span>{" "}
                        {clause.ambiguousTerms.join(", ")}
                      </p>
                    )}
                    {clause.recommendations.length > 0 && (
                      <ul className="clause-recs">
                        {clause.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}

          <ReviewActions contractId={contract.id} awaiting={awaiting} />
        </>
      )}
    </main>
  );
}

function riskBadge(level: string): string {
  if (level === "HIGH" || level === "CRITICAL") return "badge-err";
  if (level === "MEDIUM") return "badge-busy";
  return "badge-ok";
}
