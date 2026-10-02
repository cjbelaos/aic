"use client";

import {
  useState,
  type CSSProperties,
  type FormEvent,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, User, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import authService from "@/lib/services/auth.service";
import { GoogleTokenPanel } from "@/components/auth/google-token-panel";

/**
 * BRAND COLORS: change these 4 values to match your logo and the whole
 * login page follows. Tip: pick them straight from the logo file.
 *  - deep:   darkest logo color (side panel background, headings)
 *  - main:   primary logo color (button, focus rings, links)
 *  - accent: secondary logo color (small highlights only)
 *  - soft:   very light tint of the main color (page background)
 */
const BRAND = {
  "--brand-deep": "#12285f", // navy of the drop
  "--brand-main": "#1f56a8", // mid blue of the drop
  "--brand-accent": "#5f9f2f", // green of the leaf
  "--brand-soft": "#f2f7fa", // pale blue-green tint
} as CSSProperties;

interface FieldErrors {
  username?: string;
  password?: string;
}

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");

  /** Per-field validation — returns true if form is valid */
  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!username.trim()) errors.username = "Enter your username.";
    if (!password) errors.password = "Enter your password.";
    else if (password.length < 6)
      errors.password = "Password must be at least 6 characters.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError("");

    if (!validate()) return;

    startTransition(async () => {
      try {
        const res = await authService.login({
          username: username.trim(),
          password,
        });

        if (!res.isSuccess) {
          setServerError(
            res.errorMessages?.length
              ? res.errorMessages.join(" ")
              : "Invalid username or password.",
          );
          return;
        }

        // Enrich identity from the authenticated session (/api/auth/me) as a
        // fallback in case the login response omits departmentId/positionId.
        const loginResult = res.result;
        let deptId: number | null = loginResult?.departmentId ?? null;
        let posId: number | null = loginResult?.positionId ?? null;
        let superAdmin = loginResult?.isSuperAdmin === true;
        try {
          const me = await authService.me();
          if (me.isSuccess && me.result) {
            if (deptId == null && me.result.departmentId != null) {
              deptId = me.result.departmentId;
            }
            if (posId == null && me.result.positionId != null) {
              posId = me.result.positionId;
            }
            if (me.result.isSuperAdmin) {
              superAdmin = true;
            }
          }
        } catch {
          // ignore — fall back to whatever the login response provided
        }

        // Save session meta-data to localStorage
        window.localStorage.setItem(
          "auth:user",
          JSON.stringify({
            userId: loginResult?.userId ?? "",
            userName: loginResult?.userName ?? username,
            fullName: loginResult?.fullName ?? "",
            userRoleId: loginResult?.userRoleId ?? 2,
            departmentId: deptId,
            positionId: posId,
            isSuperAdmin: superAdmin,
          }),
        );

        router.replace("/dashboard");
      } catch (err) {
        setServerError(
          err instanceof Error
            ? err.message
            : "Unable to connect to the server.",
        );
      }
    });
  };

  const inputBase =
    "h-11 border-slate-300 bg-white pl-10 text-slate-900 placeholder:text-slate-400 " +
    "focus-visible:border-[var(--brand-main)] focus-visible:ring-2 focus-visible:ring-[var(--brand-main)]/25";
  const inputError =
    "border-red-400 focus-visible:border-red-500 focus-visible:ring-red-400/30";

  return (
    <div
      style={BRAND}
      className="grid min-h-screen bg-[var(--brand-soft)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
    >
      {/* Brand panel (desktop only) */}
      <aside className="relative hidden overflow-hidden bg-[var(--brand-deep)] lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
        {/* Soft color glows taken from the logo palette */}
        <div
          aria-hidden
          className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[var(--brand-main)] opacity-40 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -right-24 -bottom-32 h-96 w-96 rounded-full bg-[var(--brand-accent)] opacity-25 blur-3xl"
        />

        <div className="relative flex max-w-sm flex-col items-center text-center">
          {/* White tile keeps the logo readable whatever its background is */}
          <div className="flex h-36 w-36 items-center justify-center rounded-3xl bg-white p-5 shadow-2xl shadow-black/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Company logo"
              className="h-full w-full object-contain"
            />
          </div>
          <h2 className="mt-10 text-3xl font-semibold leading-tight tracking-tight text-white">
            Everything your team needs, in one place.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            Sign in to manage your work, your people, and your reports.
          </p>
          <div
            aria-hidden
            className="mt-10 h-1 w-16 rounded-full bg-[var(--brand-accent)]"
          />
        </div>
      </aside>

      {/* Form side */}
      <main className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          {/* Logo shown on mobile, where the brand panel is hidden */}
          <div className="mb-8 flex justify-center lg:hidden">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-3 shadow-md ring-1 ring-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Company logo"
                className="h-full w-full object-contain"
              />
            </div>
          </div>

          <div className="mb-8 text-center lg:text-left">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--brand-deep)]">
              Welcome back
            </h1>
            <p className="mt-2 text-base text-slate-600">
              Sign in with your username and password.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            {serverError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{serverError}</p>
              </div>
            )}

            {/* Username */}
            <div className="space-y-2">
              <Label
                htmlFor="username"
                className="text-sm font-medium text-slate-700"
              >
                Username
              </Label>
              <div className="relative">
                <User
                  className={`pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 ${
                    fieldErrors.username ? "text-red-400" : "text-slate-400"
                  }`}
                />
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                  disabled={isPending}
                  aria-invalid={!!fieldErrors.username}
                  aria-describedby={
                    fieldErrors.username ? "username-error" : undefined
                  }
                  className={`${inputBase} ${fieldErrors.username ? inputError : ""}`}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (fieldErrors.username)
                      setFieldErrors((p) => ({ ...p, username: undefined }));
                    setServerError("");
                  }}
                />
              </div>
              {fieldErrors.username && (
                <p id="username-error" className="text-sm text-red-600">
                  {fieldErrors.username}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-slate-700"
              >
                Password
              </Label>
              <div className="relative">
                <Lock
                  className={`pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 ${
                    fieldErrors.password ? "text-red-400" : "text-slate-400"
                  }`}
                />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={isPending}
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={
                    fieldErrors.password ? "password-error" : undefined
                  }
                  className={`${inputBase} pr-11 ${fieldErrors.password ? inputError : ""}`}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password)
                      setFieldErrors((p) => ({ ...p, password: undefined }));
                    setServerError("");
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isPending}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-[var(--brand-main)] focus-visible:ring-2 focus-visible:ring-[var(--brand-main)]/40 focus-visible:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="text-sm text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="h-11 w-full bg-[var(--brand-main)] text-base font-medium text-white shadow-sm transition-colors hover:bg-[var(--brand-deep)] focus-visible:ring-2 focus-visible:ring-[var(--brand-main)]/40 focus-visible:ring-offset-2 disabled:opacity-80"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </div>
      </main>

      <GoogleTokenPanel />
    </div>
  );
}
