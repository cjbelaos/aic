import { NextRequest, NextResponse } from "next/server";
import { addUser, getUsers, getUserByUsername } from "@/lib/userSheets";
import {
  requireAdminSession,
  requireAuthenticatedSession,
} from "@/lib/auth/session";
import { toPublicUser } from "@/lib/userSheets";
import type { CreateUserInput, UserRole } from "@/types/user";

function parseRole(value: unknown): UserRole {
  return String(value || "user")
    .trim()
    .toLowerCase() === "admin"
    ? "admin"
    : "user";
}

export async function GET(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    // Support username lookup via query parameter: /api/users?username=xxx
    const { searchParams } = new URL(request.url);
    const usernameQuery = searchParams.get("username");

    if (usernameQuery) {
      const user = await getUserByUsername(usernameQuery);
      if (!user) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }
      return NextResponse.json(toPublicUser(user), { status: 200 });
    }

    const users = await getUsers();
    return NextResponse.json(users, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch users.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (session instanceof Response) return session;

  try {
    const body = await request.json();
    const input: CreateUserInput = {
      username: String(body.username || "").trim(),
      fullName: String(body.fullName || "").trim(),
      email: String(body.email || "").trim(),
      password: String(body.password || ""),
      role: parseRole(body.role),
    };

    const user = await addUser(input);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create user.";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
