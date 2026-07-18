import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getUserByUsername } from "@/lib/userSheets";
import { getDriveImageUrl } from "@/lib/signatureUpload";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { username } = await params;
    const user = await getUserByUsername(username);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (!user.signature) {
      return NextResponse.json(
        { error: "No signature found for this user." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        fileId: user.signature,
        imageUrl: getDriveImageUrl(user.signature),
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch signature.";
    console.error("Signature fetch error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
