"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ChevronDown, Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Reads the current hostname safely (client-only, "" during SSR). */
function getHostname(): string {
  return typeof window === "undefined" ? "" : window.location.hostname;
}

/** hostname never changes during a page lifetime. */
function subscribeHostname(): () => void {
  return () => {};
}

/** True only on the developer's machine (localhost / 127.0.0.1). */
function getIsLocalSnapshot(): boolean {
  const host = getHostname();
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * Google Refresh Token generator for the LOGIN page.
 *
 * LOCAL DEVELOPMENT ONLY — the panel only renders when the app is served
 * from localhost/127.0.0.1, so it never appears on the deployed (Vercel)
 * login page. It exists so an operator locked out of the dashboard (e.g.
 * login fails on localhost with "Invalid credentials") can still regenerate
 * GOOGLE_REFRESH_TOKEN for their local .env.local. The popup flow posts the
 * token back via window.postMessage.
 */
export function GoogleTokenPanel() {
  // SSR snapshot = false (panel hidden server-side); client snapshot = the
  // real localhost check. No effect/setState needed → no hydration mismatch.
  const isLocal = useSyncExternalStore(
    subscribeHostname,
    getIsLocalSnapshot,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshToken, setRefreshToken] = useState("");
  const [tokenError, setTokenError] = useState("");
  const popupRef = useRef<Window | null>(null);
  const generatingRef = useRef(false);

  // Listen for the token sent back from the popup via postMessage
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "GOOGLE_TOKEN") return;
      popupRef.current?.close();
      popupRef.current = null;
      setGenerating(false);
      generatingRef.current = false;
      if (event.data.refresh_token) {
        setRefreshToken(event.data.refresh_token);
        setTokenError("");
      } else if (event.data.error) {
        setTokenError(event.data.error);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const startTokenFlow = useCallback(async () => {
    setGenerating(true);
    generatingRef.current = true;
    setTokenError("");
    setRefreshToken("");
    try {
      const res = await fetch("/api/auth/google-token");
      const data = (await res.json()) as {
        authUrl?: string;
        error?: string;
      };
      if (!data.authUrl) {
        setTokenError(data.error ?? "Failed to start authorization.");
        setGenerating(false);
        generatingRef.current = false;
        return;
      }
      const popup = window.open(
        data.authUrl,
        "google-oauth",
        "width=600,height=700",
      );
      popupRef.current = popup;
      if (!popup) {
        setTokenError(
          "Popup was blocked. Please allow popups for this site and try again.",
        );
        setGenerating(false);
        generatingRef.current = false;
        return;
      }
      const checkClosed = setInterval(() => {
        if (popupRef.current?.closed) {
          clearInterval(checkClosed);
          popupRef.current = null;
          if (generatingRef.current) {
            generatingRef.current = false;
            setGenerating(false);
            setTokenError(
              "Authorization window was closed without completing.",
            );
          }
        }
      }, 500);
    } catch {
      setTokenError("Network error. Please try again.");
      setGenerating(false);
      generatingRef.current = false;
    }
  }, []);

  const copyToken = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(refreshToken);
      toast.success("Refresh token copied to clipboard!");
    } catch {
      toast.error("Failed to copy. Please select and copy manually.");
    }
  }, [refreshToken]);

  if (!isLocal) return null;
return (
    <div className="mt-4 w-full max-w-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Google Token (troubleshooting)
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded-md border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
          {!refreshToken && !generating && !tokenError && (
            <>
              <p className="text-xs leading-relaxed text-slate-600">
                Your login depends on Google credentials. If logging in fails
                on localhost (for example “Invalid credentials” with the right
                password), the{" "}
                <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">
                  GOOGLE_REFRESH_TOKEN
                </code>{" "}
                in{" "}
                <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">
                  .env.local
                </code>{" "}
                may be stale or the dev server is running an old route
                definition — restart it with{" "}
                <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">
                  npm run dev
                </code>
                .
              </p>
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={startTokenFlow}
              >
                Generate Refresh Token
              </Button>
            </>
          )}

          {generating && (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              <p className="text-xs text-slate-500">
                Complete authorization in the popup window…
              </p>
            </div>
          )}

          {tokenError && (
            <div className="space-y-2">
              <p className="text-xs text-red-600">{tokenError}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={startTokenFlow}
              >
                Try Again
              </Button>
            </div>
          )}

          {refreshToken && (
            <div className="space-y-2">
              <Label htmlFor="login-token-output" className="text-xs">
                Your New Refresh Token
              </Label>
              <div className="flex gap-2">
                <Input
                  id="login-token-output"
                  readOnly
                  value={refreshToken}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyToken}
                  title="Copy to clipboard"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Copy this token and set it as{" "}
                <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">
                  GOOGLE_REFRESH_TOKEN
                </code>{" "}
                in your{" "}
                <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">
                  .env.local
                </code>{" "}
                file, then restart{" "}
                <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">
                  npm run dev
                </code>
                .
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}