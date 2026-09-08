import { NextResponse } from "next/server";
import { getBearerToken, verifyMobileToken } from "@/lib/jwt";
import {
  createFieldWorkLog,
  getFieldWorkLogsByUser,
  FieldWorkLogInput,
} from "@/lib/fieldWorkLogs";

/**
 * POST /api/mobile/field-work-logs
 *
 * Submits a field work log for the authenticated mobile user.
 *
 * Header: Authorization: Bearer <JWT_TOKEN>
 * Body:   {
 *           "date": "YYYY-MM-DD",
 *           "customer": string,
 *           "workDescription": string,
 *           "timeStart": "HH:mm:ss" | "HH:mm AM/PM",
 *           "timeEnd":   "HH:mm:ss" | "HH:mm AM/PM",
 *           "customerRep": string,
 *           "customerSignature": string,   // Base64 data string or URL
 *           "location"?: string            // GPS coordinates or address
 *         }
 * 201:    { "message": string, "workLogId": string, "date": string }
 *
 * GET /api/mobile/field-work-logs?limit=50
 *
 * Lists the authenticated user's own field work logs, newest first.
 * 200:    { "logs": FieldWorkLog[] }
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?$/;
// Google Sheets cell limit (50,000 chars). Base64 signature images that
// exceed this must be uploaded and sent as a URL instead.
const MAX_SIGNATURE_CHARS = 50_000;

const REQUIRED_FIELDS = [
  "date",
  "customer",
  "workDescription",
  "timeStart",
  "timeEnd",
  "customerRep",
  "customerSignature",
];

/**
 * Validates the request body for a work log submission.
 * Returns `{ ok: true, input }` on success or `{ ok: false, error, status }`.
 */
function validateInput(
  body: unknown,
): { ok: true; input: FieldWorkLogInput } | { ok: false; error: string; status: number } {
  const data = (body && typeof body === "object"
    ? body
    : {}) as Record<string, unknown>;

  const missing = REQUIRED_FIELDS.filter(
    (field) => String(data[field] ?? "").trim() === "",
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required field(s): ${missing.join(", ")}.`,
      status: 400,
    };
  }

  const date = String(data.date).trim();
  if (!DATE_RE.test(date)) {
    return {
      ok: false,
      error: `Invalid date "${date}". Expected format YYYY-MM-DD.`,
      status: 400,
    };
  }

  for (const field of ["timeStart", "timeEnd"]) {
    const time = String(data[field]).trim();
    if (!TIME_RE.test(time)) {
      return {
        ok: false,
        error: `Invalid ${field} "${time}". Expected HH:mm:ss or HH:mm AM/PM.`,
        status: 400,
      };
    }
  }

  const signature = String(data.customerSignature).trim();
  if (signature.length > MAX_SIGNATURE_CHARS) {
    return {
      ok: false,
      error:
        `customerSignature exceeds the ${MAX_SIGNATURE_CHARS}-character Google Sheets cell limit. Upload the image and send a URL instead.`,
      status: 400,
    };
  }

  return {
    ok: true,
    input: {
      date,
      customer: String(data.customer).trim(),
      workDescription: String(data.workDescription).trim(),
      timeStart: String(data.timeStart).trim(),
      timeEnd: String(data.timeEnd).trim(),
      customerRep: String(data.customerRep).trim(),
      customerSignature: signature,
      location:
        data.location !== undefined && String(data.location).trim() !== ""
          ? String(data.location).trim()
          : undefined,
    },
  };
}

export async function POST(request: Request) {
  try {
    // 1. Extract and verify the Bearer token
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json(
        { error: "Authorization header with a Bearer token is required." },
        { status: 401 },
      );
    }

    const payload = verifyMobileToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 },
      );
    }

    // 2. Parse and validate the request body
    const body = await request.json();
    const result = validateInput(body);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    // 3. Append the work log to the FieldWorkLogs sheet
    const log = await createFieldWorkLog(payload.userId, result.input);

    // 4. Success response
    return NextResponse.json(
      {
        message: "Field work log submitted successfully.",
        workLogId: log.workLogId,
        date: log.date,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to submit field work log.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    // 1. Extract and verify the Bearer token
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json(
        { error: "Authorization header with a Bearer token is required." },
        { status: 401 },
      );
    }

    const payload = verifyMobileToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 },
      );
    }

    // 2. Optional limit (clamped to a sane range)
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") || "50");
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
      : 50;

    // 3. Fetch this user's logs
    const logs = await getFieldWorkLogsByUser(payload.userId, limit);

    return NextResponse.json({ logs });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load field work logs.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}