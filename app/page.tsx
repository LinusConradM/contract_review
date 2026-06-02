import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSessionUser();

  return (
    <main className="home">
      <section className="hero">
        <p className="eyebrow">AI-powered legal workflow</p>
        <h1>Review contracts faster, with confidence</h1>
        <p className="lead">
          Upload a PDF agreement and our agent breaks it into clauses, analyses
          each one for risk in parallel, pauses for your review, and streams a
          final summary—all on durable background tasks that never time out.
        </p>
        <div className="hero-actions">
          {user ? (
            <Link href="/dashboard" className="button">
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link href="/signup" className="button">
                Get started free
              </Link>
              <Link href="/login" className="btn-secondary">
                Log in
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="features">
        <div className="feature">
          <h2>Clause-by-clause analysis</h2>
          <p>
            Dense contracts are split into individual clauses so each section
            gets focused LLM risk scoring—not a single shallow pass over the
            whole document.
          </p>
        </div>
        <div className="feature">
          <h2>Human in the loop</h2>
          <p>
            Flagged clauses pause for your approval before the agent produces a
            final report, so lawyers stay in control of outcomes.
          </p>
        </div>
        <div className="feature">
          <h2>Built for reliability</h2>
          <p>
            Retries, concurrency limits, and full run observability mean 50+
            clause agreements complete reliably—not fragile one-shot API calls.
          </p>
        </div>
      </section>
    </main>
  );
}
