import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Site-wide gate for non-production deployments (staging). When SITE_BASIC_AUTH
 * is set to "user:password", every request (pages, API routes, assets) needs
 * those HTTP Basic credentials before anything else runs, independent of the
 * application's own user accounts. Unset (production) it does nothing.
 */
function credentialsMatch(header: string | null, expected: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  const supplied = Buffer.from(Buffer.from(header.slice(6), "base64").toString("utf8"));
  const wanted = Buffer.from(expected);
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

export function proxy(request: NextRequest) {
  const expected = process.env.SITE_BASIC_AUTH;
  if (!expected) return NextResponse.next();
  if (credentialsMatch(request.headers.get("authorization"), expected)) return NextResponse.next();
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="AIC staging", charset="UTF-8"' },
  });
}
