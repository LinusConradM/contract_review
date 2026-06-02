"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewReport } from "@/lib/report";

type FlatClause = {
  number: number;
  text: string;
  riskLevel: string;
  explanation: string;
  ambiguousTerms: string[];
  recommendations: string[];
};

type Decision = { approved: boolean | null; notes: string };
type SaveState = "idle" | "saving" | "saved" | "error";

export default function ReviewDashboard({
  contractId,
  awaiting,
  report,
  initialDecisions,
}: {
  contractId: string;
  awaiting: boolean;
  report: ReviewReport;
  initialDecisions: Record<number, { approved: boolean; notes: string }>;
}) {
  const router = useRouter();

  const clauses = useMemo<FlatClause[]>(
    () => report.groups.flatMap((g) => g.clauses),
    [report]
  );

  const [decisions, setDecisions] = useState<Record<number, Decision>>(() => {
    const init: Record<number, Decision> = {};
    for (const c of clauses) {
      const existing = initialDecisions[c.number];
      init[c.number] = existing
        ? { approved: existing.approved, notes: existing.notes }
        : { approved: null, notes: "" };
    }
    return init;
  });
  const [saveState, setSaveState] = useState<Record<number, SaveState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reviewedCount = clauses.filter(
    (c) => decisions[c.number]?.approved !== null
  ).length;
  const allReviewed = reviewedCount === clauses.length && clauses.length > 0;

  function setSave(index: number, state: SaveState) {
    setSaveState((prev) => ({ ...prev, [index]: state }));
  }

  async function persist(index: number, approved: boolean, notes: string) {
    if (!awaiting) return;
    setSave(index, "saving");
    try {
      const res = await fetch(
        `/api/contracts/${contractId}/clauses/${index}/decision`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ approved, notes }),
        }
      );
      const data = await res.json().catch(() => ({}));
      setSave(index, res.ok && data.ok ? "saved" : "error");
    } catch {
      setSave(index, "error");
    }
  }

  function decide(index: number, approved: boolean) {
    const notes = decisions[index]?.notes ?? "";
    setDecisions((prev) => ({ ...prev, [index]: { approved, notes } }));
    persist(index, approved, notes);
  }

  function changeNotes(index: number, notes: string) {
    setDecisions((prev) => ({
      ...prev,
      [index]: { approved: prev[index]?.approved ?? null, notes },
    }));
  }

  function saveNotes(index: number) {
    const d = decisions[index];
    // Notes are stored alongside a decision; persist only once approve/reject
    // has been chosen for this clause.
    if (d && d.approved !== null) persist(index, d.approved, d.notes);
  }

  function jumpTo(index: number) {
    const el = document.getElementById(`clause-${index}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const payload = {
        decisions: clauses.map((c) => ({
          clauseIndex: c.number,
          approved: decisions[c.number]?.approved,
          notes: decisions[c.number]?.notes || undefined,
        })),
      };
      const res = await fetch(`/api/contracts/${contractId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setSubmitError(data.error ?? "Failed to submit review.");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setSubmitError("Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function navState(index: number): "approved" | "rejected" | "pending" {
    const a = decisions[index]?.approved;
    if (a === true) return "approved";
    if (a === false) return "rejected";
    return "pending";
  }

  return (
    <div className="review-layout">
      <aside className="review-nav">
        <div className="review-progress">
          <div className="review-progress-label">
            {reviewedCount} / {clauses.length} reviewed
          </div>
          <div className="review-progress-bar">
            <span
              style={{
                width: `${
                  clauses.length ? (reviewedCount / clauses.length) * 100 : 0
                }%`,
              }}
            />
          </div>
        </div>
        <ul className="review-nav-list">
          {clauses.map((c) => (
            <li key={c.number}>
              <button
                type="button"
                className={`review-nav-chip nav-${navState(c.number)}`}
                onClick={() => jumpTo(c.number)}
                title={`Clause ${c.number} — ${navState(c.number)}`}
              >
                {c.number}
              </button>
            </li>
          ))}
        </ul>
        {awaiting && (
          <div className="review-submit">
            {submitError && <p className="form-error">{submitError}</p>}
            {!allReviewed && (
              <p className="review-hint">
                Review all clauses to submit ({clauses.length - reviewedCount}{" "}
                left).
              </p>
            )}
            <button
              type="button"
              disabled={!allReviewed || submitting}
              onClick={submit}
            >
              {submitting ? "Submitting…" : "Submit review"}
            </button>
          </div>
        )}
      </aside>

      <div className="review-clauses">
        {done && (
          <section className="card">
            <p className="status-ok">
              Review submitted. The paused analysis run has resumed.
            </p>
          </section>
        )}
        {!awaiting && !done && (
          <section className="card">
            <p>
              This contract is no longer awaiting review — decisions below are
              read-only.
            </p>
          </section>
        )}

        {clauses.map((c) => {
          const d = decisions[c.number];
          const ss = saveState[c.number];
          return (
            <section
              id={`clause-${c.number}`}
              key={c.number}
              className={`card review-clause-card state-${navState(c.number)}`}
            >
              <div className="clause-head">
                <span className={`badge ${riskBadge(c.riskLevel)}`}>
                  {c.riskLevel.toLowerCase()} risk
                </span>
                <strong>Clause {c.number}</strong>
                <span className={`review-state-tag tag-${navState(c.number)}`}>
                  {navState(c.number) === "approved"
                    ? "Approved"
                    : navState(c.number) === "rejected"
                      ? "Rejected"
                      : "Not reviewed"}
                </span>
              </div>

              <p className="report-clause-text">{c.text}</p>

              <div className="clause-analysis">
                <p className="clause-explanation">{c.explanation}</p>
                {c.ambiguousTerms.length > 0 && (
                  <p className="clause-tags">
                    <span className="clause-tags-label">Ambiguous:</span>{" "}
                    {c.ambiguousTerms.join(", ")}
                  </p>
                )}
                {c.recommendations.length > 0 && (
                  <ul className="clause-recs">
                    {c.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                )}
              </div>

              {awaiting ? (
                <div className="clause-decision">
                  <div className="decision-buttons">
                    <button
                      type="button"
                      className={`decision-btn approve ${
                        d?.approved === true ? "active" : ""
                      }`}
                      onClick={() => decide(c.number, true)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className={`decision-btn reject ${
                        d?.approved === false ? "active" : ""
                      }`}
                      onClick={() => decide(c.number, false)}
                    >
                      Reject
                    </button>
                    {ss === "saving" && (
                      <span className="save-indicator">Saving…</span>
                    )}
                    {ss === "saved" && (
                      <span className="save-indicator saved">Saved</span>
                    )}
                    {ss === "error" && (
                      <span className="save-indicator error">Save failed</span>
                    )}
                  </div>
                  <textarea
                    className="review-notes"
                    rows={2}
                    placeholder="Annotation — explain your reasoning or give instructions…"
                    value={d?.notes ?? ""}
                    onChange={(e) => changeNotes(c.number, e.target.value)}
                    onBlur={() => saveNotes(c.number)}
                  />
                </div>
              ) : (
                d?.notes && (
                  <p className="review-readonly-note">
                    <strong>Note:</strong> {d.notes}
                  </p>
                )
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function riskBadge(level: string): string {
  if (level === "HIGH" || level === "CRITICAL") return "badge-err";
  if (level === "MEDIUM") return "badge-busy";
  return "badge-ok";
}
