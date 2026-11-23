"use client";

import {
  useState,
  type FormEvent,
  type KeyboardEvent,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowBigUp,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import authService from "@/lib/services/auth.service";
import { GoogleTokenPanel } from "@/components/auth/google-token-panel";

/** Company name shown on the brand panel, mobile header and footer. */
const COMPANY = "AIC";
// Brand colors (light and dark) live in globals.css under ".login-shell".

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
  const [capsLock, setCapsLock] = useState(false);

  const trackCapsLock = (e: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState("CapsLock"));

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

  const field =
    "h-12 rounded-xl border-[var(--login-border)] bg-[var(--login-field)] pl-11 text-base text-[var(--login-text)] shadow-[0_1px_2px_rgb(15_27_51/0.04)] " +
    "placeholder:text-[var(--login-muted)]/75 dark:bg-[var(--login-field)] md:text-[15px] " +
    "transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--login-border),var(--login-text)_18%)] " +
    "focus-visible:border-[var(--login-focus)] focus-visible:ring-4 focus-visible:ring-[var(--login-focus)]/15";
  const fieldError =
    "border-red-400 hover:border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500/15 dark:border-red-400/70";
  const iconClass = (hasError: boolean) =>
    `pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 transition-colors ${
      hasError
        ? "text-red-500"
        : "text-[var(--login-muted)] group-focus-within:text-[var(--login-focus)]"
    }`;
  const passwordHelp =
    [
      fieldErrors.password ? "password-error" : null,
      capsLock ? "password-caps" : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="login-shell grid min-h-screen bg-[var(--login-surface)] text-[var(--login-text)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Brand panel (desktop only) */}
      <aside className="relative hidden overflow-hidden bg-[var(--login-panel)] lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
        {/* Light from the logo palette: blue above, leaf green below */}
        <div
          aria-hidden
          className="login-glow absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-[var(--brand-main)] opacity-40 blur-[100px]"
        />
        <div
          aria-hidden
          className="login-glow absolute -right-40 -bottom-56 h-[24rem] w-[24rem] rounded-full bg-[var(--brand-accent)] opacity-20 blur-[100px]"
        />
        {/* Soft pool of light so the logo's navy edge reads against the panel */}
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 h-80 w-80 -translate-x-1/2 -translate-y-[62%] rounded-full bg-white/10 blur-3xl"
        />

        <div className="login-rise relative flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt=""
            width={208}
            height={208}
            className="h-52 w-52 object-contain drop-shadow-[0_18px_32px_rgb(0_0_0/0.35)]"
          />
          <p className="mt-8 text-6xl font-semibold tracking-[-0.03em] text-white">
            {COMPANY}
          </p>
        </div>
      </aside>

      {/* Form side */}
      <main className="flex min-h-screen flex-col px-5 sm:px-8">
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="login-rise-late w-full max-w-[380px]">
            {/* Logo + name on mobile, where the brand panel is hidden */}
            <div className="mb-10 flex items-center justify-center gap-3 lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                width={56}
                height={56}
                className="h-14 w-14 object-contain"
              />
              <span className="text-3xl font-semibold tracking-[-0.03em] text-[var(--login-heading)]">
                {COMPANY}
              </span>
            </div>

            <div className="mb-9 text-center lg:text-left">
              <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.025em] text-balance text-[var(--login-heading)]">
                Welcome back
              </h1>
              <p className="mt-2 text-base text-[var(--login-muted)]">
                Sign in with your username and password.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
              {serverError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/30 dark:bg-red-500/10"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {serverError}
                  </p>
                </div>
              )}

              {/* Username */}
              <div className="space-y-2">
                <Label
                  htmlFor="username"
                  className="text-sm font-medium text-[var(--login-text)]"
                >
                  Username
                </Label>
                <div className="group relative">
                  <User className={iconClass(!!fieldErrors.username)} />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    disabled={isPending}
                    aria-invalid={!!fieldErrors.username}
                    aria-describedby={
                      fieldErrors.username ? "username-error" : undefined
                    }
                    className={`${field} ${fieldErrors.username ? fieldError : ""}`}
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
                  <p
                    id="username-error"
                    className="text-sm text-red-600 dark:text-red-400"
                  >
                    {fieldErrors.username}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium text-[var(--login-text)]"
                >
                  Password
                </Label>
                <div className="group relative">
                  <Lock className={iconClass(!!fieldErrors.password)} />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={isPending}
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={passwordHelp}
                    className={`${field} pr-12 ${fieldErrors.password ? fieldError : ""}`}
                    value={password}
                    onKeyDown={trackCapsLock}
                    onKeyUp={trackCapsLock}
                    onBlur={() => setCapsLock(false)}
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
                    className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--login-muted)] transition-colors hover:bg-[var(--login-focus)]/10 hover:text-[var(--login-focus)] focus-visible:ring-2 focus-visible:ring-[var(--login-focus)]/50 focus-visible:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="h-[18px] w-[18px]" />
                    ) : (
                      <Eye className="h-[18px] w-[18px]" />
                    )}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p
                    id="password-error"
                    className="text-sm text-red-600 dark:text-red-400"
                  >
                    {fieldErrors.password}
                  </p>
                )}
                <p
                  id="password-caps"
                  aria-live="polite"
                  className={
                    capsLock
                      ? "flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400"
                      : "sr-only"
                  }
                >
                  {capsLock && (
                    <>
                      <ArrowBigUp className="h-4 w-4 shrink-0" />
                      Caps Lock is on.
                    </>
                  )}
                </p>
              </div>

              <Button
                type="submit"
                disabled={isPending}
                className="group/submit mt-2 h-12 w-full gap-2 rounded-xl bg-[var(--login-button)] text-base font-medium text-white shadow-[0_1px_2px_rgb(15_27_51/0.12),0_10px_24px_-10px_rgb(31_86_168/0.55)] transition-[background-color,box-shadow] hover:bg-[var(--login-button-hover)] focus-visible:ring-4 focus-visible:ring-[var(--login-focus)]/30 disabled:opacity-80 dark:bg-[var(--login-button)] dark:text-white dark:hover:bg-[var(--login-button-hover)]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/submit:translate-x-0.5" />
                  </>
                )}
              </Button>
            </form>

            <GoogleTokenPanel />
          </div>
        </div>

        <footer className="pb-6 text-center text-xs text-[var(--login-muted)]">
          © {new Date().getFullYear()} {COMPANY} · Internal use only
        </footer>
      </main>
    </div>
  );
}
