import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";
import { getUserByUsername, updateLastLogin } from "@/lib/userSheets";
import { setSessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!username || !password) {
      return NextResponse.json(
        {
          isSuccess: false,
          errorMessages: ["Username and password are required."],
        },
        { status: 400 },
      );
    }
    const user = await getUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash, user.salt)) {
      return NextResponse.json(
        {
          isSuccess: false,
          errorMessages: ["Invalid username or password."],
        },
        { status: 401 },
      );
    }

    await updateLastLogin(user.userId);

    await setSessionCookie({
      userId: user.userId,
      username: user.username,
      email: user.email,
      userRoleId: user.userRoleId,
      departmentId: user.departmentId,
      positionId: user.positionId,
      fullName: user.fullName,
    });

    return NextResponse.json({
      isSuccess: true,
      result: {
        fullName: user.fullName,
        userName: user.username,
        userRoleId: user.userRoleId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Login failed unexpectedly.";
    return NextResponse.json(
      { isSuccess: false, errorMessages: [message] },
      { status: 500 },
    );
  }
}
