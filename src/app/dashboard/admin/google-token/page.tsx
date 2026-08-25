"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getUserRoleId(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem("auth:user");
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { userRoleId?: number };
    return parsed.userRoleId ?? 0;
  } catch {
    return 0;
  }
}

type Step = "password-gate" | "generator";

export default function GoogleTokenPage() {
  const router = useRouter();

  // ── Admin guard (client-side) ──
  const [adminReady, setAdminReady] = useState(false);
  useEffect(() => {
    if (getUserRoleId() !== 1) {
      router.replace("/dashboard");
      return;
    }
    setAdminReady(true);
  }, [router]);

  // ── Password gate ──
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [checkingPassword, setCheckingPassword] = useState(false);
  const [step, setStep] = useState<Step>("password-gate");

  const verifyPassword = useCallback(async () => {
    if (!password.trim()) {
      setPasswordError("Password is required.");
      return;
    }
    setPasswordError("");
    setCheckingPassword(true);
    try {
      const res = await fetch("/api/admin/verify-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as {
        isSuccess: boolean;
        errorMessages?: string[];
      };
      if (data.isSuccess) {
        setStep("generator");
      } else {
        setPasswordError(data.errorMessages?.[0] ?? "Access denied.");
      }
    } catch {
      setPasswordError("Unable to verify password. Please try again.");
    } finally {
      setCheckingPassword(false);
    }
  }, [password]);

  // ── Token generator ──
  const [generating, setGenerating] = useState(false);
  const [refreshToken, setRefreshToken] = useState("");
  const [tokenError, setTokenError] = useState("");
  const popupRef = useRef<Window | null>(null);

  // Listen for the token sent back from the popup via postMessage
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "GOOGLE_TOKEN") return;
      popupRef.current?.close();
      popupRef.current = null;
      setGenerating(false);
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
    setTokenError("");
    setRefreshToken("");
    try {
      const res = await fetch("/api/admin/google-token");
      const data = (await res.json()) as {
        authUrl?: string;
        isSuccess?: boolean;
        errorMessages?: string[];
      };
      if (!data.authUrl) {
        setTokenError(data.errorMessages?.[0] ?? "Failed to start authorization.");
        setGenerating(false);
        return;
      }
      const popup = window.open(data.authUrl, "google-oauth", "width=600,height=700");
      popupRef.current = popup;
      if (!popup) {
        setTokenError("Popup was blocked. Please allow popups for this site and try again.");
        setGenerating(false);
        return;
      }
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          popupRef.current = null;
          setGenerating(false);
          if (!refreshToken) {
            setTokenError("Authorization window was closed without completing.");
          }
        }
      }, 500);
    } catch {
      setTokenError("Network error. Please try again.");
      setGenerating(false);
    }
  }, [refreshToken]);

  const copyToken = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(refreshToken);
      toast.success("Refresh token copied to clipboard!");
    } catch {
      toast.error("Failed to copy. Please select and copy manually.");
    }
  }, [refreshToken]);

  if (!adminReady) return null;
// ═══════════════ PASSWORD GATE ═══════════════
  if (step === "password-gate") {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Admin Access Required
            </CardTitle>
            <CardDescription>
              Enter the admin access password to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") verifyPassword();
                }}
                disabled={checkingPassword}
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
            <Button
              className="w-full"
              onClick={verifyPassword}
              disabled={checkingPassword}
            >
              {checkingPassword && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {checkingPassword ? "Verifying…" : "Unlock"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ═══════════════ TOKEN GENERATOR ═══════════════
  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Google Refresh Token Generator
          </CardTitle>
          <CardDescription>
            Generate a new Google OAuth refresh token. You will be prompted to
            authorize the app in a popup window.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!refreshToken && !generating && !tokenError && (
            <Button className="w-full" onClick={startTokenFlow}>
              Generate Refresh Token
            </Button>
          )}

          {generating && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground text-center">
                Complete authorization in the popup window…
              </p>
            </div>
          )}

          {tokenError && (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{tokenError}</p>
              <Button className="w-full" onClick={startTokenFlow}>
                Try Again
              </Button>
            </div>
          )}

          {refreshToken && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="token-output">Your New Refresh Token</Label>
                <div className="flex gap-2">
                  <Input
                    id="token-output"
                    readOnly
                    value={refreshToken}
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyToken}
                    title="Copy to clipboard"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Copy this token and set it as{" "}
                <code className="bg-muted px-1 rounded">GOOGLE_REFRESH_TOKEN</code>{" "}
                in your{" "}
                <code className="bg-muted px-1 rounded">.env.local</code> file.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setRefreshToken("");
                  setTokenError("");
                }}
              >
                Generate Another
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}