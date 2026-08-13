import { NextResponse } from "next/server";

/**
 * Normalizes a point (address string or coordinate object) into the format
 * accepted by the Apps Script direction-finder. Coordinate objects like
 * { lat, lng } or { Latitude, Longitude } become "lat,lng" strings.
 */
function normalizePoint(point: unknown): string {
  if (typeof point === "object" && point !== null) {
    const o = point as Record<string, unknown>;
    const lat = o.lat ?? o.Latitude;
    const lng = o.lng ?? o.Longitude;
    if (typeof lat === "number" && typeof lng === "number") {
      return `${lat},${lng}`;
    }
    return "";
  }
  return String(point ?? "").trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const endpoint = process.env.NEXT_PUBLIC_APPS_SCRIPT_DISTANCE_URL;

    if (!endpoint) {
      return NextResponse.json(
        {
          status: "error",
          message: "Apps Script URL not configured in environment variables.",
        },
        { status: 500 },
      );
    }

    const origin = body.origin;
    const legs = Array.isArray(body.legs) ? body.legs.slice(0, 5) : [];

    if (!origin || legs.length === 0) {
      return NextResponse.json({
        status: "success",
        totalKm: 0,
        legDistances: [],
      });
    }

    let totalKm = 0;
    const legDistances: { legIndex: number; distanceKm: number }[] = [];

    // Compute distance between consecutive points:
    //   leg 0: origin              → legs[0]
    //   leg 1: legs[0]             → legs[1]
    //   leg 2: legs[1]             → legs[2]
    //   …and so on…
    let previousPoint = origin; // starts at the origin

    for (let i = 0; i < legs.length; i++) {
      const destination = legs[i].destination;
      if (!destination) {
        legDistances.push({ legIndex: i, distanceKm: 0 });
        continue;
      }

      const appScriptPayload = {
        origin: normalizePoint(previousPoint),
        destination: normalizePoint(destination),
      };

      if (!appScriptPayload.origin || !appScriptPayload.destination) {
        legDistances.push({ legIndex: i, distanceKm: 0 });
        continue;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appScriptPayload),
        redirect: "follow",
        cache: "no-store",
      });

      if (!response.ok) {
        console.error(
          `Apps Script HTTP error for leg ${i}: ${response.status}`,
        );
        legDistances.push({ legIndex: i, distanceKm: 0 });
        continue;
      }

      const result = await response.json();
      const distanceKm =
        typeof result.distanceKm === "number" ? result.distanceKm : 0;

      legDistances.push({ legIndex: i, distanceKm });
      totalKm += distanceKm;

      // Next leg starts from this destination
      previousPoint = destination;
    }

    return NextResponse.json({
      status: "success",
      totalKm: Math.round(totalKm * 100) / 100,
      legDistances,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to compute distance",
      },
      { status: 500 },
    );
  }
}
