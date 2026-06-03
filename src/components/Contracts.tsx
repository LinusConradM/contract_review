"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Contract = {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  status: string;
  pageCount: number | null;
  clauseCount: number;
  error: string | null;
  uploadedAt: string;
};

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type ClauseAnalysis = {
  riskLevel: RiskLevel;
  explanation: string;
  ambiguousTerms: string[];
  recommendations: string[];
};

type Detail = {
  extractedText: string | null;
  clauses: {
    index: number;
    text: string;
    analysis: ClauseAnalysis | null;
  }[];
};

const PROCESSING = new Set([
  "UPLOADED",
  "EXTRACTING",
  "EXTRACTED",
  "SPLITTING",
  "SPLIT",
  "ANALYZING",
]);

function statusClass(status: string): string {
  if (status === "FAILED" || status === "CANCELLED") return "badge-err";
  if (status === "AWAITING_REVIEW" || status === "COMPLETED") return "badge-ok";
  if (PROCESSING.has(status)) return "badge-busy";
  return "badge-info";
}

function riskClass(level: RiskLevel): string {
  if (level === "HIGH" || level === "CRITICAL") return "badge-err";
  if (level === "MEDIUM") return "badge-busy";
  return "badge-ok";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Contracts() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<"text" | "clauses">("clauses");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const loadContracts = useCallback(async () => {
    const res = await fetch("/api/contracts");
    if (!res.ok) return;
    const data = await res.json();
    setContracts(data.contracts ?? []);
  }, []);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  useEffect(() => {
    const anyProcessing = contracts.some((c) => PROCESSING.has(c.status));
    if (!anyProcessing) return;
    const interval = setInterval(loadContracts, 2500);
    return () => clearInterval(interval);
  }, [contracts, loadContracts]);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      const docxMime =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const acceptable =
        /\.(pdf|docx)$/i.test(file.name) ||
        file.type === "application/pdf" ||
        file.type === docxMime;
      if (!acceptable) {
        setError("Only PDF and Word (.docx) files are accepted.");
        return;
      }
      setUploading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/contracts/upload", {
          method: "POST",
          body,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Upload failed.");
          return;
        }
        await loadContracts();
      } catch {
        setError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [loadContracts]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) upload(file);
    },
    [upload]
  );

  const open = useCallback(
    async (id: string, m: "text" | "clauses") => {
      if (openId === id && mode === m) {
        setOpenId(null);
        setDetail(null);
        return;
      }
      // Same row, different view: reuse the already-loaded detail.
      if (openId === id && detail) {
        setMode(m);
        return;
      }
      setOpenId(id);
      setMode(m);
      setDetail(null);
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/contracts/${id}`);
        const data = await res.json();
        setDetail({
          extractedText: data.contract?.extractedText ?? null,
          clauses: data.contract?.clauses ?? [],
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [openId, mode, detail]
  );

  return (
    <>
      <section className="card">
        <h2>Upload a contract</h2>
        <div
          className={`dropzone${dragActive ? " dropzone-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <p className="dropzone-text">
            {uploading
              ? "Uploading…"
              : "Drag a PDF or Word file here, or click to choose"}
          </p>
          <p className="dropzone-hint">PDF or Word (.docx) · up to 25 MB</p>
        </div>
        {error && <p className="form-error">{error}</p>}
      </section>

      <section className="card">
        <h2>Your contracts</h2>
        {contracts.length === 0 ? (
          <p>No contracts yet. Upload a PDF or Word file to get started.</p>
        ) : (
          <ul className="contract-list">
            {contracts.map((c) => (
              <li key={c.id} className="contract-item">
                <div className="contract-row">
                  <div>
                    <strong>{c.title}</strong>
                    <span className="contract-meta">
                      {c.fileName} · {formatBytes(c.fileSize)}
                      {c.pageCount != null ? ` · ${c.pageCount} pages` : ""}
                      {c.clauseCount > 0 ? ` · ${c.clauseCount} clauses` : ""}
                    </span>
                  </div>
                  <span className={`badge ${statusClass(c.status)}`}>
                    {c.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>
                {c.error && <p className="contract-error">{c.error}</p>}
                <div className="contract-actions">
                  {c.clauseCount > 0 && (
                    <button
                      className="link-btn"
                      onClick={() => open(c.id, "clauses")}
                    >
                      {openId === c.id && mode === "clauses"
                        ? "Hide clauses"
                        : "View clauses"}
                    </button>
                  )}
                  {(c.pageCount != null || c.status === "EXTRACTED") && (
                    <button
                      className="link-btn"
                      onClick={() => open(c.id, "text")}
                    >
                      {openId === c.id && mode === "text"
                        ? "Hide raw text"
                        : "View raw text"}
                    </button>
                  )}
                  {(c.status === "AWAITING_REVIEW" ||
                    c.status === "COMPLETED") && (
                    <Link className="link-btn" href={`/contracts/${c.id}/review`}>
                      {c.status === "AWAITING_REVIEW"
                        ? "Review report"
                        : "View report"}
                    </Link>
                  )}
                </div>

                {openId === c.id && (
                  <div className="detail">
                    {detailLoading ? (
                      <pre className="result">Loading…</pre>
                    ) : mode === "clauses" ? (
                      detail && detail.clauses.length > 0 ? (
                        <ol className="clause-list">
                          {detail.clauses.map((cl) => (
                            <li key={cl.index} className="clause">
                              <div className="clause-head">
                                <span className="clause-text">{cl.text}</span>
                                {cl.analysis && (
                                  <span
                                    className={`badge ${riskClass(
                                      cl.analysis.riskLevel
                                    )}`}
                                  >
                                    {cl.analysis.riskLevel.toLowerCase()} risk
                                  </span>
                                )}
                              </div>
                              {cl.analysis && (
                                <div className="clause-analysis">
                                  <p className="clause-explanation">
                                    {cl.analysis.explanation}
                                  </p>
                                  {cl.analysis.ambiguousTerms.length > 0 && (
                                    <p className="clause-tags">
                                      <span className="clause-tags-label">
                                        Ambiguous:
                                      </span>{" "}
                                      {cl.analysis.ambiguousTerms.join(", ")}
                                    </p>
                                  )}
                                  {cl.analysis.recommendations.length > 0 && (
                                    <ul className="clause-recs">
                                      {cl.analysis.recommendations.map(
                                        (rec, i) => (
                                          <li key={i}>{rec}</li>
                                        )
                                      )}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <pre className="result">(No clauses.)</pre>
                      )
                    ) : (
                      <pre className="result">
                        {detail?.extractedText && detail.extractedText.length > 0
                          ? detail.extractedText
                          : "(No text was extracted — the PDF may be image-only.)"}
                      </pre>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
