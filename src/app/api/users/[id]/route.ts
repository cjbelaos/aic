import { NextResponse } from "next/server";
import { deleteUser, updateUser } from "@/lib/userSheets";
import { requireAdminSession } from "@/lib/auth/session";
import type { UpdateUserInput, UserRole } from "@/types/user";

function parseRole(value: unknown): UserRole | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value).trim().toLowerCase() === "admin" ? "admin" : "user";
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const body = await request.json();

    const updatedData: UpdateUserInput = {
      username:
        body.username !== undefined ? String(body.username).trim() : undefined,
      fullName:
        body.fullName !== undefined ? String(body.fullName).trim() : undefined,
      email: body.email !== undefined ? String(body.email).trim() : undefined,
      password: body.password !== undefined ? String(body.password) : undefined,
      role: parseRole(body.role),
    };

    const user = await updateUser(id, updatedData);
    return NextResponse.json(user, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update user.";
    const status = message.includes("not found")
      ? 404
      : message.includes("already exists")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    await deleteUser(id);
    return NextResponse.json(
      { message: "User deleted successfully." },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete user.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
