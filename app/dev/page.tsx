"use client";

import Link from "next/link";
import { useState } from "react";

type TestResult = {
  ok: boolean;
  label: string;
  data?: unknown;
  error?: string;
};

async function runTest(url: string, label: string): Promise<TestResult> {
  try {
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, label, error: data.error ?? res.statusText };
    }
    return { ok: true, label, data };
  } catch (e) {
    return {
      ok: false,
      label,
      error: e instanceof Error ? e.message : "Request failed",
    };
  }
}

export default function DevToolsPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleTest(key: string, url: string, label: string) {
    setLoading(key);
    const result = await runTest(url, label);
    setResults((prev) => [result, ...prev.filter((r) => r.label !== label)]);
    setLoading(null);
  }

  return (
    <main>
      <p className="subtitle">
        <Link href="/dashboard">← Dashboard</Link>
      </p>
      <h1>Developer tools</h1>
      <p className="subtitle">Step Zero — verify Trigger.dev, LLM, and database.</p>

      <section className="card">
        <h2>1. Trigger.dev — hello-world task</h2>
        <p>
          Requires <code>npm run dev</code> and <code>TRIGGER_SECRET_KEY</code> in{" "}
          <code>.env.local</code>.
        </p>
        <button
          disabled={loading === "trigger"}
          onClick={() =>
            handleTest("trigger", "/api/hello-world", "Trigger.dev task")
          }
        >
          {loading === "trigger" ? "Triggering…" : "Trigger hello-world"}
        </button>
      </section>

      <section className="card">
        <h2>2. LLM providers</h2>
        <button
          disabled={loading === "llm-groq"}
          onClick={() =>
            handleTest("llm-groq", "/api/test/llm?provider=groq", "Groq")
          }
          style={{ marginRight: "0.5rem" }}
        >
          {loading === "llm-groq" ? "Calling…" : "Test Groq"}
        </button>
        <button
          disabled={loading === "llm-openai"}
          onClick={() =>
            handleTest("llm-openai", "/api/test/llm?provider=openai", "OpenAI")
          }
          style={{ marginRight: "0.5rem" }}
        >
          {loading === "llm-openai" ? "Calling…" : "Test OpenAI"}
        </button>
        <button
          disabled={loading === "llm-anthropic"}
          onClick={() =>
            handleTest(
              "llm-anthropic",
              "/api/test/llm?provider=anthropic",
              "Anthropic"
            )
          }
        >
          {loading === "llm-anthropic" ? "Calling…" : "Test Anthropic"}
        </button>
      </section>

      <section className="card">
        <h2>3. Database</h2>
        <button
          disabled={loading === "db"}
          onClick={() => handleTest("db", "/api/test/db", "Database")}
        >
          {loading === "db" ? "Testing…" : "Test database read/write"}
        </button>
      </section>

      {results.length > 0 && (
        <section className="card">
          <h2>Results</h2>
          {results.map((r) => (
            <div key={r.label} style={{ marginBottom: "1rem" }}>
              <strong className={r.ok ? "status-ok" : "status-err"}>
                {r.ok ? "✓" : "✗"} {r.label}
              </strong>
              <pre className="result">
                {r.error ? r.error : JSON.stringify(r.data, null, 2)}
              </pre>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
