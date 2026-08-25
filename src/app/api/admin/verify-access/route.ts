import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (session instanceof Response) return session;

  try {
    const { password } = (await request.json()) as { password?: string };

    if (!password) {
      return NextResponse.json(
        { isSuccess: false, errorMessages: ["Password is required."] },
        { status: 400 },
      );
    }

    const expected = process.env.ADMIN_ACCESS_PASSWORD;
    if (!expected) {
      return NextResponse.json(
        {
          isSuccess: false,
          errorMessages: ["ADMIN_ACCESS_PASSWORD is not configured on the server."],
        },
        { status: 500 },
      );
    }

    if (password !== expected) {
      return NextResponse.json(
        { isSuccess: false, errorMessages: ["Incorrect password."] },
        { status: 403 },
      );
    }

    return NextResponse.json({ isSuccess: true });
  } catch {
    return NextResponse.json(
      { isSuccess: false, errorMessages: ["Invalid request."] },
      { status: 400 },
    );
  }
}