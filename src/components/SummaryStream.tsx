"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useRealtimeRun,
  useRealtimeStream,
} from "@trigger.dev/react-hooks";
import { SUMMARY_STREAM_ID } from "@/lib/streamKeys";
import FinalReport from "./FinalReport";

// Live / replay view of the final memorandum streamed from the LLM.
//
// - mode "live": used while the memorandum is being generated (status
//   SUMMARIZING). Renders real stream chunks as they arrive and auto-refreshes
//   to the stored report once the run completes.
// - mode "replay": used on demand after completion. Reads the SAME persisted
//   stream chunks back off the run, then reveals the text at a paced cadence so
//   the incremental token effect is clearly visible (stored chunks otherwise
//   arrive almost instantly, all within one render).
//
// In both modes the stream is persisted on the run, so a mid-stream refresh
// replays everything received so far.
export default function SummaryStream({
  runId,
  accessToken,
  mode = "live",
  backHref,
  contractId,
}: {
  runId: string;
  accessToken: string;
  mode?: "live" | "replay";
  backHref?: string;
  // When provided (live mode), enables a Cancel button that aborts the run.
  contractId?: string;
}) {
  const router = useRouter();
  const isLive = mode === "live";

  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function cancel() {
    if (!contractId) return;
    setCancelError(null);
    setCancelling(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/cancel`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setCancelError(data?.error ?? "Could not cancel.");
        return;
      }
      router.refresh();
    } catch {
      setCancelError("Could not cancel. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  const { parts, error } = useRealtimeStream<string>(
    runId,
    SUMMARY_STREAM_ID,
    { accessToken }
  );

  // Only watch the run (to auto-swap to the stored report) in live mode. In
  // replay mode the run is already COMPLETED, so this is disabled — otherwise it
  // would refresh away before the replay could play.
  const { run } = useRealtimeRun(runId, { accessToken, enabled: isLive });
  const refreshed = useRef(false);
  useEffect(() => {
    if (!isLive) return;
    const status = run?.status;
    if (
      !refreshed.current &&
      (status === "COMPLETED" || status === "FAILED")
    ) {
      refreshed.current = true;
      router.refresh();
    }
  }, [isLive, run?.status, router]);

  const fullText = parts.join("");

  // Paced reveal for replay: advance a character cursor on a timer so the doc
  // types itself out over a few seconds regardless of how fast the stored
  // chunks loaded. Live mode shows the real text directly.
  const [revealed, setRevealed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isLive || fullText.length === 0) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRevealed((r) => {
        // ~160 steps total -> roughly 4s reveal for any length, min pace 3.
        const step = Math.max(3, Math.ceil(fullText.length / 160));
        const next = Math.min(r + step, fullText.length);
        if (next >= fullText.length && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return next;
      });
    }, 25);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isLive, fullText.length]);

  const text = isLive ? fullText : fullText.slice(0, revealed);
  const replaying = !isLive && fullText.length > 0 && revealed < fullText.length;

  return (
    <section className="card">
      <div className="final-report-head">
        <h2>
          {isLive ? "Final review memorandum" : "Replaying generation"}
        </h2>
        {isLive ? (
          <span className="final-report-meta replay-controls">
            <span className="stream-live">
              <span className="stream-dot" aria-hidden /> streaming live
            </span>
            {contractId && (
              <button
                type="button"
                className="stream-cancel-btn"
                onClick={cancel}
                disabled={cancelling}
              >
                {cancelling ? "Cancelling…" : "Cancel"}
              </button>
            )}
          </span>
        ) : (
          <span className="final-report-meta replay-controls">
            {replaying && (
              <span className="stream-live">
                <span className="stream-dot" aria-hidden /> replaying
              </span>
            )}
            {backHref && (
              <Link href={backHref} className="stream-replay-link">
                ← Back to report
              </Link>
            )}
          </span>
        )}
      </div>

      {cancelError && <p className="stream-error">{cancelError}</p>}

      {error ? (
        <p className="stream-error">
          Could not load the stream: {error.message}
        </p>
      ) : text ? (
        <FinalReport markdown={text} />
      ) : (
        <p className="stream-pending">
          {isLive
            ? "Generating the final memorandum…"
            : "Replaying the generation…"}
        </p>
      )}
    </section>
  );
}
