import crypto from "crypto";

export function generateSalt(): string {
  return crypto.randomBytes(4).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return crypto.createHash("sha256").update(`${password}${salt}`).digest("hex");
}

export function verifyPassword(
  password: string,
  storedHash: string,
  salt: string,
): boolean {
  const plainHash = crypto.createHash("sha256").update(password).digest("hex");
  if (plainHash === storedHash) return true;
  if (hashPassword(password, salt) === storedHash) return true;
  if (
    crypto.createHash("sha256").update(`${salt}${password}`).digest("hex") ===
    storedHash
  ) {
    return true;
  }
  return false;
}
