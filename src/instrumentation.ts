/**
 * Opt-in Google API request tracer (set SHEETS_TRACE=1).
 *
 * Used for the Supabase migration baseline and acceptance test: it records
 * every outbound request to Google APIs so page loads can be checked for
 * Sheets calls. It is a no-op unless the env var is set, and it logs only
 * method, host, API path shape, status and timing — never request bodies,
 * tokens or cell values.
 */
export async function register() {
  if (process.env.SHEETS_TRACE !== "1") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installGoogleApiTracer } = await import("./lib/dev/googleApiTracer");
  installGoogleApiTracer();
}
