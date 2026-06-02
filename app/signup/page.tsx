import Link from "next/link";
import { register } from "@/actions/auth";
import { AuthForm } from "@/components/AuthForm";

export const metadata = {
  title: "Sign up — Contract Review",
};

export default function SignUpPage() {
  return (
    <main className="auth-page">
      <h1>Create your account</h1>
      <p className="subtitle">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
      <AuthForm action={register} submitLabel="Create account">
        <label>
          Name <span className="optional">(optional)</span>
          <input type="text" name="name" autoComplete="name" maxLength={100} />
        </label>
      </AuthForm>
    </main>
  );
}
