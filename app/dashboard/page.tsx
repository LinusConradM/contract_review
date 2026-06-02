import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Dashboard — Contract Review",
};

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <main>
      <h1>Welcome{user.name ? `, ${user.name}` : ""}</h1>
      <p className="subtitle">
        Signed in as <strong>{user.email}</strong>. Contract upload and review
        workflows will be available in the next steps.
      </p>

      <section className="card">
        <h2>Coming next</h2>
        <p>
          Upload PDF contracts, run parallel clause risk analysis, approve
          flagged items, and receive a streamed final summary.
        </p>
      </section>

      <p className="subtitle">
        <Link href="/dev">Developer tools</Link> (Step Zero tests)
      </p>
    </main>
  );
}
