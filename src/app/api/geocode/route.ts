import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

// Nominatim's usage policy requires a real User-Agent identifying the app.
// Provide one via NOMINATIM_USER_AGENT env var, or fall back to a generic
// identifier that does not include a fake/placeholder contact email.
const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  "AIC-FTI-App/1.0 (Aerich Innovation Corp internal FTI application)";

// Throttle Nominatim requests to 1/sec as required by usage policy.
let lastRequestTime = 0;
async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now();
  const waitMs = Math.max(0, 1000 - (now - lastRequestTime));
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }
  lastRequestTime = Date.now();
  return fetch(url, {
    headers: {
      "User-Agent": NOMINATIM_USER_AGENT,
      Accept: "application/json",
    },
    cache: "no-store",
  });
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body = await request.json();
    const type = body?.type;

    if (type === "forward") {
      const query = String(body?.query || "").trim();
      if (!query) {
        return NextResponse.json(
          { error: "Query is required for forward geocoding." },
          { status: 400 },
        );
      }
      const url = `${NOMINATIM_BASE}/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const res = await throttledFetch(url);
      if (!res.ok) {
        return NextResponse.json(
          { error: `Nominatim search failed with status ${res.status}.` },
          { status: 502 },
        );
      }
      const results = await res.json();
      const first =
        Array.isArray(results) && results.length > 0 ? results[0] : null;
      if (!first) {
        return NextResponse.json({ result: null }, { status: 200 });
      }
      return NextResponse.json({
        result: {
          latitude: parseFloat(first.lat),
          longitude: parseFloat(first.lon),
          displayName: first.display_name || "",
        },
      });
    }

    if (type === "reverse") {
      const lat = Number(body?.lat);
      const lng = Number(body?.lng);
      if (isNaN(lat) || isNaN(lng)) {
        return NextResponse.json(
          { error: "Valid lat and lng are required for reverse geocoding." },
          { status: 400 },
        );
      }
      const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`;
      const res = await throttledFetch(url);
      if (!res.ok) {
        return NextResponse.json(
          { error: `Nominatim reverse failed with status ${res.status}.` },
          { status: 502 },
        );
      }
      const data = await res.json();
      return NextResponse.json({
        result: {
          latitude: lat,
          longitude: lng,
          displayName: data.display_name || "",
        },
      });
    }

    return NextResponse.json(
      { error: "Invalid geocode type. Use 'forward' or 'reverse'." },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to geocode.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}