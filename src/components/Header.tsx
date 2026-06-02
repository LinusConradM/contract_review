import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { logout } from "@/actions/auth";

export async function Header() {
  const user = await getSessionUser();

  return (
    <header className="site-header">
      <Link href="/" className="logo">
        Contract Review
      </Link>
      <nav>
        {user ? (
          <>
            <Link href="/dashboard">Dashboard</Link>
            <span className="nav-email">{user.email}</span>
            <form action={logout}>
              <button type="submit" className="btn-secondary">
                Log out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login">Log in</Link>
            <Link href="/signup" className="button">
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
