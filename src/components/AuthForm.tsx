"use client";

import { useActionState } from "react";
import type { AuthFormState } from "@/actions/auth";

type AuthFormProps = {
  action: (
    state: AuthFormState,
    formData: FormData
  ) => Promise<AuthFormState>;
  submitLabel: string;
  children?: React.ReactNode;
};

const initialState: AuthFormState = {};

export function AuthForm({ action, submitLabel, children }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="auth-form">
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      {children}

      <label>
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          aria-invalid={!!state.fieldErrors?.email}
        />
        {state.fieldErrors?.email && (
          <span className="field-error">{state.fieldErrors.email[0]}</span>
        )}
      </label>

      <label>
        Password
        <input
          type="password"
          name="password"
          autoComplete={
            submitLabel === "Create account" ? "new-password" : "current-password"
          }
          required
          minLength={submitLabel === "Create account" ? 8 : undefined}
          aria-invalid={!!state.fieldErrors?.password}
        />
        {state.fieldErrors?.password && (
          <span className="field-error">{state.fieldErrors.password[0]}</span>
        )}
      </label>

      <button type="submit" disabled={pending}>
        {pending ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}
