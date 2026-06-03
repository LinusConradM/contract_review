import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@trigger.dev/sdk/v3";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ReviewReport } from "@/lib/report";
import ReviewDashboard from "@/components/ReviewDashboard";
import FinalReport from "@/components/FinalReport";
import SummaryStream from "@/components/SummaryStream";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review contract — Contract Review",
};

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stream?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { stream } = await searchParams;
  const replay = stream === "1";
  const contract = await prisma.contract.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      status: true,
      runId: true,
      summary: {
        select: {
          content: true,
          finalReport: true,
          finalReportModel: true,
          finalReportProvider: true,
          finalReportAt: true,
        },
      },
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
  const finalReport = contract.summary?.finalReport ?? null;
  const finalReportAt = contract.summary?.finalReportAt ?? null;

  // While the memorandum is being generated (or just after), there's no stored
  // report yet — render it live from the run's realtime stream instead.
  const showLiveStream =
    !finalReport &&
    !!contract.runId &&
    (contract.status === "SUMMARIZING" || contract.status === "COMPLETED");

  // Opt-in replay (?stream=1): after completion, play the persisted stream back
  // token-by-token instead of showing the stored report. Lets you witness the
  // incremental streaming on demand without racing the generation window.
  const showReplay = replay && !!finalReport && !!contract.runId;

  // Mint a short-lived public token scoped to read just this run so the browser
  // hook can subscribe to its realtime stream.
  let streamToken: string | null = null;
  if ((showLiveStream || showReplay) && contract.runId) {
    streamToken = await auth.createPublicToken({
      scopes: { read: { runs: [contract.runId] } },
      expirationTime: "1h",
    });
  }

  const basePath = `/contracts/${contract.id}/review`;

  return (
    <main>
      <p className="subtitle">
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
      <h1>{contract.title}</h1>
      <p className="subtitle">
        Status: <strong>{contract.status.replace(/_/g, " ").toLowerCase()}</strong>
      </p>

      {showReplay && streamToken && contract.runId ? (
        <SummaryStream
          runId={contract.runId}
          accessToken={streamToken}
          mode="replay"
          backHref={basePath}
        />
      ) : (
        finalReport && (
          <section className="card">
            <div className="final-report-head">
              <h2>Final review memorandum</h2>
              <span className="final-report-meta">
                {contract.summary?.finalReportProvider}
                {contract.summary?.finalReportModel
                  ? ` · ${contract.summary.finalReportModel}`
                  : ""}
                {finalReportAt
                  ? ` · ${new Date(finalReportAt).toLocaleString()}`
                  : ""}
                {contract.runId ? (
                  <>
                    {" · "}
                    <Link
                      href={`${basePath}?stream=1`}
                      className="stream-replay-link"
                    >
                      Replay generation
                    </Link>
                  </>
                ) : null}
              </span>
            </div>
            <FinalReport markdown={finalReport} />
          </section>
        )
      )}

      {showLiveStream && streamToken && contract.runId && (
        <SummaryStream
          runId={contract.runId}
          accessToken={streamToken}
          contractId={contract.id}
        />
      )}

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
