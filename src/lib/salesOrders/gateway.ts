// Apps Script gateway client — the ONLY outbound write path for sales orders.
// All authoritative writes (drafts included) go through the locked gateway so
// concurrency and version guards are enforced server-side. When the gateway is
// not yet deployed/configured, every write fails with a retryable 503 so no
// path silently falls back to an unsynchronized direct write.

import { dependencyUnavailable, gatewayBusy, commandReplay, versionConflict, badRequest } from "./errors.ts";
import { signCommand, verifyCommand } from "./protocol.ts";
import type { UnsignedCommand } from "./protocol.ts";
import { payloadHash } from "./sync.ts";

export interface GatewayRequest {
  command: UnsignedCommand;
  payload: unknown;
}

export interface GatewayResult<T> {
  ok: boolean;
  replayed: boolean;
  result: T;
}

export function isGatewayConfigured(): boolean {
  return Boolean(process.env.SALES_ORDER_GATEWAY_URL && process.env.SALES_ORDER_GATEWAY_SECRET);
}

function gatewayUrl(): string {
  const url = process.env.SALES_ORDER_GATEWAY_URL;
  if (!url) throw dependencyUnavailable("The sales-order write gateway is not configured (SALES_ORDER_GATEWAY_URL). No writes were attempted.");
  return url;
}

export function verifyEnvironment(): void {
  if (!isGatewayConfigured()) {
    throw dependencyUnavailable(
      "The sales-order write gateway is not configured. Authoritative writes are refused until " +
      "SALES_ORDER_GATEWAY_URL and SALES_ORDER_GATEWAY_SECRET are set and the Apps Script deployment is live.",
    );
  }
}

export interface GatewayTransport {
  postAsJson(url: string, body: unknown, timeoutMs: number): Promise<{ status: number; text: string }>;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** ContentService redirects to its output host and carries semantic status
 * in JSON. Transport failures and application errors are handled separately. */
const defaultTransport: GatewayTransport = {
  async postAsJson(url, body, timeoutMs) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: response.status, text: await response.text() };
  },
};

export interface SendGatewayOptions {
  transport?: GatewayTransport;
  timeoutMs?: number;
  /** Injectable for tests; defaults to the configured gateway URL. */
  urlOverride?: string;
}

/**
 * Signs the command with the server-side secret and posts it to the gateway.
 * The gateway is the authority on idempotency (command receipt) and version
 * guards; this client maps its structured responses onto the API error
 * contract (409 conflict/replay, 503 busy/not-configured, 400 rejected).
 *
 * The transport is injectable so the REAL client code is exercised in tests
 * against a local server implementing the gateway contract — the test never
 * simulates the gateway business logic inside a fake client.
 */
export async function sendGatewayCommand<T>(
  request: GatewayRequest,
  options: SendGatewayOptions = {},
): Promise<GatewayResult<T>> {
  verifyEnvironment();
  const secret = process.env.SALES_ORDER_GATEWAY_SECRET ?? "";
  const envelope = signCommand(secret, request.command);
  const body = { envelope, payload: request.payload };
  const transport = options.transport ?? defaultTransport;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = options.urlOverride ?? gatewayUrl();

  let response: { status: number; text: string };
  try {
    response = await transport.postAsJson(url, body, timeoutMs);
  } catch (error) {
    throw dependencyUnavailable(
      `The sales-order gateway could not be reached: ${error instanceof Error ? error.message : String(error)}. ` +
      "The save outcome is unknown; retry with the same command ID.",
    );
  }

  let data: unknown;
  try {
    data = response.text ? JSON.parse(response.text) : null;
  } catch {
    // Apps Script deployments return the HtmlService homepage (text/html) for
    // deployment URLs that are not serving doPost as expected. Treating that
    // as a retryable dependency failure is safer than raising a server error.
    if (response.status >= 500) throw gatewayBusy(`The sales-order gateway returned HTTP ${response.status}.`);
    throw dependencyUnavailable(
      `The sales-order gateway returned a non-JSON response (HTTP ${response.status}). ` +
      "Check the deployment URL and ContentService mime type.",
    );
  }

  const semantic = data as { ok?: boolean; status?: number; message?: string; currentVersion?: number } | null;
  const status = response.status === 200 && semantic?.status ? semantic.status : response.status;
  if (status === 503) throw gatewayBusy("The sales-order gateway is busy; retry later.");
  if (status === 409) {
    const payload = data as { message?: string; currentVersion?: number };
    if (payload.currentVersion !== undefined) {
      throw versionConflict(payload.message ?? "Version conflict on the sales order.", payload.currentVersion);
    }
    throw commandReplay(payload.message ?? "Command ID was already used.");
  }
  if (!(status >= 200 && status < 300) || semantic?.ok === false) {
    const payload = data as { message?: string };
    throw badRequest(payload?.message ?? `Gateway rejected the command (HTTP ${response.status}).`);
  }
  if (!semantic || semantic.ok !== true || !("result" in semantic)) throw dependencyUnavailable("Invalid gateway response.");
  return data as GatewayResult<T>;
}

export { payloadHash, verifyCommand };
