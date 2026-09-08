import jwt from "jsonwebtoken";

/**
 * Mobile JWT helpers.
 *
 * The mobile app authenticates with a JWT (`Authorization: Bearer <token>`)
 * instead of the web session cookie. Tokens carry the user identity and
 * expire after 30 days so the app does not force a re-login too often.
 *
 * The Google service-account credentials used to talk to Sheets stay on the
 * server — the mobile client only ever sees this JWT.
 */

export type MobileTokenPayload = {
  userId: string;
  username: string;
  userRoleId: number;
};

const TOKEN_EXPIRES_DAYS = 30;

/**
 * Returns the JWT signing secret. Must come from the environment (JWT_SECRET).
 * A dummy fallback is provided for local development only; production always
 * throws when the secret is missing so tokens can never be signed with a
 * known-default key by accident.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is not set. Add it to your environment before going live.",
    );
  }
  return "dev-only-jwt-secret-change-me";
}

/**
 * Signs a mobile JWT containing the user identity, valid for 30 days.
 */
export function signMobileToken(payload: MobileTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: `${TOKEN_EXPIRES_DAYS}d`,
  });
}

/**
 * Verifies and decodes a mobile JWT.
 * Returns the user payload when the token is valid, otherwise `null`.
 */
export function verifyMobileToken(
  token: string,
): MobileTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded === "string") return null;
    if (
      typeof decoded.userId === "string" &&
      typeof decoded.username === "string" &&
      typeof decoded.userRoleId === "number"
    ) {
      return {
        userId: decoded.userId,
        username: decoded.username,
        userRoleId: decoded.userRoleId,
      };
    }
    return null;
  } catch {
    // Malformed, expired, or tampered tokens are simply rejected.
    return null;
  }
}

/**
 * Extracts a Bearer token from a request's `Authorization` header.
 * Returns `null` when the header is missing or not a Bearer token.
 */
export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const [scheme, ...rest] = auth.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== "bearer" || rest.length === 0) {
    return null;
  }
  const token = rest.join(" ").trim();
  return token || null;
}