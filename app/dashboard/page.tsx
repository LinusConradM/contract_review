import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Contracts from "@/components/Contracts";

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
        Signed in as <strong>{user.email}</strong>. Upload a PDF contract to
        extract its text.
      </p>

      <Contracts />

      <p className="subtitle">
        <Link href="/dev">Developer tools</Link> (Step Zero tests)
      </p>
    </main>
  );
}
