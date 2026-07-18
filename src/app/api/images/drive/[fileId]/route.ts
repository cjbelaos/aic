import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getSheetsAndDriveClient } from "@/lib/googleSheets";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { fileId } = await params;

    const { drive } = await getSheetsAndDriveClient();

    // Download the file content from Drive
    const response = await drive.files.get(
      {
        fileId,
        alt: "media",
      },
      { responseType: "arraybuffer" },
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);
    const contentType = response.headers["content-type"] || "image/png";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    console.error("Drive image proxy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch image from Drive." },
      { status: 500 },
    );
  }
}
