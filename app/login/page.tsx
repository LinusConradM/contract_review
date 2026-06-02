import Link from "next/link";
import { login } from "@/actions/auth";
import { AuthForm } from "@/components/AuthForm";

export const metadata = {
  title: "Log in — Contract Review",
};

export default function LoginPage() {
  return (
    <main className="auth-page">
      <h1>Log in</h1>
      <p className="subtitle">
        Don&apos;t have an account? <Link href="/signup">Sign up</Link>
      </p>
      <AuthForm action={login} submitLabel="Log in" />
    </main>
  );
}
