import { NextResponse } from "next/server";
import { getUserByUsername, updateLastLogin, toPublicUser } from "@/lib/userSheets";
import { hashPassword } from "@/lib/password";
import { signMobileToken } from "@/lib/jwt";

/**
 * POST /api/mobile/login
 *
 * Authenticates a mobile user against the `Users` sheet and issues a JWT
 * valid for 30 days.
 *
 * Body: { "username": string, "password": string }
 * 200:  { "token": string, "user": PublicUser }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    // 1. Validate presence of username/password
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 },
      );
    }

    // 2. Retrieve user from the Users sheet
    const user = await getUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 },
      );
    }

    // 3. Hash the provided password with the user's salt and compare
    const computedHash = hashPassword(password, user.salt);
    if (computedHash !== user.passwordHash) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 },
      );
    }

    // 4. Update last login timestamp (Users!K)
    await updateLastLogin(user.userId);

    // 5. Generate the mobile JWT
    const token = signMobileToken({
      userId: user.userId,
      username: user.username,
      userRoleId: user.userRoleId,
    });

    // 6. Return token + public profile
    return NextResponse.json({
      token,
      user: toPublicUser(user),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Login failed unexpectedly.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
