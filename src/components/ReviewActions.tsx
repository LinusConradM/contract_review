"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ReviewActions({
  contractId,
  awaiting,
}: {
  contractId: string;
  awaiting: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "approved" | "changes">(null);

  async function submit(approved: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approved, notes }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to submit review.");
        return;
      }
      setDone(approved ? "approved" : "changes");
      router.refresh();
    } catch {
      setError("Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!awaiting) {
    return (
      <section className="card">
        <p>This contract is no longer awaiting review.</p>
      </section>
    );
  }

  if (done) {
    return (
      <section className="card">
        <p className="status-ok">
          {done === "approved"
            ? "Review submitted — contract approved. The processing run has resumed."
            : "Changes requested — the processing run has resumed."}
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Your decision</h2>
      <p>
        Submitting resumes the paused analysis run. Approve to accept the
        contract, or request changes with notes for the record.
      </p>
      <label className="auth-form" style={{ marginBottom: "1rem" }}>
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="review-notes"
          placeholder="Add context for your decision…"
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="contract-actions">
        <button disabled={submitting} onClick={() => submit(true)}>
          {submitting ? "Submitting…" : "Approve"}
        </button>
        <button
          className="btn-secondary"
          disabled={submitting}
          onClick={() => submit(false)}
        >
          Request changes
        </button>
      </div>
    </section>
  );
}
