import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE_DAYS } from "./constants";

function sessionExpiry(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_MAX_AGE_DAYS);
  return expires;
}

export function generateSessionToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
}

export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = sessionExpiry();

  await prisma.session.create({
    data: { token, userId, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => {});
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  return session.user;
}
