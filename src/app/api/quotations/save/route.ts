import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { saveQuotationData, uploadPdfToDrive } from "@/lib/quotationSheets";
import { isExecutivePositionTitle } from "@/lib/positionUtils";

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    let payload: any;
    let pdfFile: File | null = null;

    // Check if multipart (has PDF) or JSON
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const rawPayload = formData.get("payload") as string;
      payload = rawPayload ? JSON.parse(rawPayload) : {};
      pdfFile = formData.get("file") as File | null;
    } else {
      payload = await request.json();
    }

    // Extract client name from customer object or direct clientName field
    const clientName =
      payload.clientName ||
      payload.customer?.customerName ||
      payload.customer?.name ||
      payload.customer ||
      "";

    // Validate required fields
    if (!clientName || !payload.quotationDescription) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing required fields: customer name and quotation description.",
        },
        { status: 400 },
      );
    }

    // Validate the approver (if provided): must belong to the same department
    // as the user preparing the quotation, OR hold an executive position
    // (General Manager, CFO, COO, CEO) which may approve for anyone.
    const approvedByValue = String(payload.approvedBy || "").trim();
    if (approvedByValue && session?.departmentId) {
      const [{ getUsers }, { getPositions }] = await Promise.all([
        import("@/lib/userSheets"),
        import("@/lib/positionSheets"),
      ]);
      const [users, positions] = await Promise.all([getUsers(), getPositions()]);
      const executivePositionIds = new Set(
        positions
          .filter((p) => isExecutivePositionTitle(p.positionTitle))
          .map((p) => p.positionId),
      );
      const lower = approvedByValue.toLowerCase();
      const approverUser = users.find(
        (u) =>
          u.fullName?.trim().toLowerCase() === lower ||
          u.username?.trim().toLowerCase() === lower,
      );
      if (!approverUser) {
        return NextResponse.json(
          { success: false, message: "Approver user not found." },
          { status: 400 },
        );
      }
      const isExecutiveApprover = executivePositionIds.has(
        approverUser.positionId,
      );
      if (
        !isExecutiveApprover &&
        approverUser.departmentId !== session.departmentId
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Approver must be in the same department as the user preparing the quotation or hold an executive position (General Manager, CFO, COO, CEO).",
          },
          { status: 400 },
        );
      }
    }

    // Determine status from payload (any user can set SENT status)
    const finalStatus: "DRAFT" | "SENT" =
      payload.status === "SENT" ? "SENT" : "DRAFT";

    // Upload PDF to Drive if provided
    let fileUrl = "";
    if (pdfFile && pdfFile.size > 0) {
      try {
        const fileBytes = await pdfFile.arrayBuffer();
        const pdfBuffer = Buffer.from(fileBytes);
        const driveResult = await uploadPdfToDrive({
          pdfBuffer,
          clientName,
          quotationDescription: payload.quotationDescription,
          quotationNo: payload.quotationNo,
        });
        fileUrl = driveResult.webViewLink;
      } catch (driveError) {
        console.error("Drive upload failed (non-fatal):", driveError);
      }
    }

    // Save to sheets
    const result = await saveQuotationData({
      clientName,
      quotationDescription: payload.quotationDescription,
      grandTotal: payload.grandTotal || 0,
      discount: payload.discount || 0,
      quotationNo: payload.quotationNo,
      preparedByName:
        payload.preparedBy || session?.fullName || session?.username || "",
      approvedBy: payload.approvedBy || "",
      sentByName:
        finalStatus === "SENT"
          ? payload.preparedBy || session?.fullName || session?.username || ""
          : "",
      fileUrl,
      status: finalStatus,
      items: (payload.items || []).map((item: any) => ({
        description: item.description || item.name || "",
        qty: item.quantity || item.qty || 0,
        unit: item.unit || "",
        priceUnit: item.pricePerUnit || item.unitPrice || item.priceUnit || 0,
      })),
      notations: Array.isArray(payload.notations)
        ? payload.notations.map((n: any) =>
            typeof n === "string" ? n : n.notation || "",
          )
        : [],
      dateIssued: payload.dateIssued,
      validUntil: payload.validUntil,
      terms: payload.terms,
      delivery: payload.delivery,
      warranty: payload.warranty,
    });

    return NextResponse.json(
      {
        success: true,
        message:
          finalStatus === "SENT"
            ? "Quotation saved and marked as sent."
            : "Quotation saved as draft.",
        data: {
          refNo: result.refNumber,
          date: result.date,
          status: finalStatus,
          fileUrl,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Save quotation error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to save quotation.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
