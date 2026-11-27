import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";
import { getUserByUsername, updateLastLogin } from "@/lib/userSheets";
import { isAccessAllowed, setSessionCookie } from "@/lib/auth/session";
import { isSuperAdminUserId } from "@/lib/auth/superAdmin";

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

    if (!isAccessAllowed(user.userId)) {
      return NextResponse.json(
        {
          isSuccess: false,
          errorMessages: ["This environment is restricted. Your account doesn't have access."],
        },
        { status: 403 },
      );
    }

    await updateLastLogin(user.userId);

    await setSessionCookie({
      userId: user.userId,
      username: user.username,
      email: user.email,
      contactNumber: user.contactNumber,
      userRoleId: user.userRoleId,
      departmentId: user.departmentId,
      positionId: user.positionId,
      fullName: user.fullName,
    });

    return NextResponse.json({
      isSuccess: true,
      result: {
        userId: user.userId,
        userName: user.username,
        fullName: user.fullName,
        userRoleId: user.userRoleId,
        departmentId: user.departmentId || 0,
        positionId: user.positionId || 0,
        isSuperAdmin: isSuperAdminUserId(user.userId),
      },
    });
  } catch (error) {
    // Infrastructure details (database, Google) stay in the server log, not on the sign-in page.
    console.error("Sign-in failed:", error);
    const message = "Sign-in is temporarily unavailable. Please try again shortly.";
    return NextResponse.json(
      { isSuccess: false, errorMessages: [message] },
      { status: 500 },
    );
  }
}
