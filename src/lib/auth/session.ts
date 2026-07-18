import crypto from "crypto";
import { cookies } from "next/headers";
import type { SessionUser, UserRole } from "@/types/user";

const SESSION_COOKIE = "aic_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function getSessionSecret(): string {
  return process.env.AUTH_SESSION_SECRET || "aic-dev-session-secret";
}

function signPayload(payload: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

export function createSessionToken(user: SessionUser): string {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function parseSessionToken(token: string): SessionUser | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as SessionUser;

    if (!parsed.username || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return parseSessionToken(token);
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export function isAdminRole(role: UserRole | string): boolean {
  return role.trim().toLowerCase() === "admin";
}

export async function requireAuthenticatedSession(): Promise<
  SessionUser | Response
> {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  return session;
}

export async function requireAdminSession(): Promise<SessionUser | Response> {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  if (!isAdminRole(session.role)) {
    return Response.json(
      { error: "Forbidden. Admin access required." },
      { status: 403 },
    );
  }

  return session;
}
