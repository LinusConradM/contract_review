"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import {
  createSession,
  deleteSession,
  hashPassword,
  loginSchema,
  registerSchema,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function register(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors,
      error: "Please fix the errors below.",
    };
  }

  const { email, password, name } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || null,
      },
    });
    await createSession(user.id);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "An account with this email already exists." };
    }
    console.error("Registration failed:", error);
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/dashboard");
}

export async function login(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors,
      error: "Please fix the errors below.",
    };
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { error: "Invalid email or password." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Invalid email or password." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/");
}
