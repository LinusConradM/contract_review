"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Contract = {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  status: string;
  pageCount: number | null;
  error: string | null;
  uploadedAt: string;
};

const PROCESSING = new Set(["UPLOADED", "EXTRACTING", "ANALYZING"]);

function statusClass(status: string): string {
  if (status === "FAILED") return "badge-err";
  if (status === "EXTRACTED" || status === "COMPLETED") return "badge-ok";
  if (PROCESSING.has(status)) return "badge-busy";
  return "badge-info";
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
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

  // Poll while anything is still processing.
  useEffect(() => {
    const anyProcessing = contracts.some((c) => PROCESSING.has(c.status));
    if (!anyProcessing) return;
    const interval = setInterval(loadContracts, 2500);
    return () => clearInterval(interval);
  }, [contracts, loadContracts]);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        setError("Only PDF files are accepted.");
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

  const viewText = useCallback(
    async (id: string) => {
      if (expanded === id) {
        setExpanded(null);
        setText(null);
        return;
      }
      setExpanded(id);
      setText(null);
      setTextLoading(true);
      try {
        const res = await fetch(`/api/contracts/${id}`);
        const data = await res.json();
        setText(data.contract?.extractedText ?? "");
      } finally {
        setTextLoading(false);
      }
    },
    [expanded]
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
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <p className="dropzone-text">
            {uploading
              ? "Uploading…"
              : "Drag a PDF here, or click to choose a file"}
          </p>
          <p className="dropzone-hint">PDF only · up to 25 MB</p>
        </div>
        {error && <p className="form-error">{error}</p>}
      </section>

      <section className="card">
        <h2>Your contracts</h2>
        {contracts.length === 0 ? (
          <p>No contracts yet. Upload a PDF to get started.</p>
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
                    </span>
                  </div>
                  <span className={`badge ${statusClass(c.status)}`}>
                    {c.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>
                {c.error && <p className="contract-error">{c.error}</p>}
                {(c.status === "EXTRACTED" || c.status === "COMPLETED") && (
                  <button className="link-btn" onClick={() => viewText(c.id)}>
                    {expanded === c.id ? "Hide text" : "View extracted text"}
                  </button>
                )}
                {expanded === c.id && (
                  <pre className="result">
                    {textLoading
                      ? "Loading…"
                      : text && text.length > 0
                      ? text
                      : "(No text was extracted — the PDF may be image-only.)"}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
