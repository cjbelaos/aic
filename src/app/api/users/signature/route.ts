import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { uploadSignatureImage } from "@/lib/signatureUpload";
import { getUserByUsername, updateUser } from "@/lib/userSheets";

export async function POST(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const formData = await request.formData();
    const file = formData.get("signature") as File | null;
    const username = (formData.get("username") as string) || session.username;

    if (!file) {
      return NextResponse.json(
        { error: "No signature image file provided." },
        { status: 400 },
      );
    }

    // Validate file type - must be image
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        {
          error:
            "File must be an image (PNG with transparent background recommended).",
        },
        { status: 400 },
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Upload to Google Drive
    const { fileId } = await uploadSignatureImage({
      imageBuffer,
      username,
    });

    // Update the user's row in the Users sheet with the Drive file ID
    const user = await getUserByUsername(username);
    if (user) {
      await updateUser(user.id, { signature: fileId });
    }

    return NextResponse.json(
      {
        fileId,
        message: "Signature uploaded successfully.",
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload signature.";
    console.error("Signature upload error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
