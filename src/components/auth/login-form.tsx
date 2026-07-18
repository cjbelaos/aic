"use client";

import { useState, type FormEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, User, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import authService from "@/lib/services/auth.service";

interface FieldErrors {
  username?: string;
  password?: string;
}

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");

  /** Per-field validation — returns true if form is valid */
  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!username.trim()) errors.username = "Username is required.";
    if (!password) errors.password = "Password is required.";
    else if (password.length < 6)
      errors.password = "Password must be at least 6 characters.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError("");

    if (!validate()) return;

    // Execute via React Transition context to handle async states natively
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

        // Save session meta-data to localStorage (matching spreadsheet structure)
        window.localStorage.setItem(
          "auth:user",
          JSON.stringify({
            userName: res.result?.userName ?? username,
            role: res.result?.role ?? "",
          }),
        );

        router.replace("/dashboard");
      } catch (err) {
        // setServerError("Unable to connect to the server. Please try again.");
        setServerError(
          err instanceof Error
            ? err.message
            : "Unable to connect to the server.",
        );
      }
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-emerald-50 px-4 py-12">
      <Card className="relative w-full max-w-md overflow-hidden border-slate-200/80 bg-white/90 shadow-xl shadow-blue-900/5 backdrop-blur-md">
        {/* Top brand accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 to-emerald-500" />

        <CardHeader className="space-y-4 pt-8">
          <div className="flex justify-center">
            <div className="relative flex h-20 w-20 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Company Logo"
                className="h-full w-full object-contain"
              />
            </div>
          </div>
          <div className="space-y-1.5 text-center">
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
              Welcome back
            </CardTitle>
            <CardDescription className="text-sm text-slate-500">
              Sign in to access your dashboard and system features.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            {/* Server-level error */}
            {serverError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
                <span className="mt-0.5 text-red-500">⚠</span>
                <p className="text-sm font-medium text-red-600">
                  {serverError}
                </p>
              </div>
            )}

            {/* Username */}
            <div className="space-y-1.5">
              <Label
                htmlFor="username"
                className="text-xs font-semibold uppercase tracking-wider text-slate-600"
              >
                Username
              </Label>
              <div className="relative">
                <User
                  className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${
                    fieldErrors.username ? "text-red-400" : "text-slate-400"
                  }`}
                />
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  autoComplete="username"
                  disabled={isPending}
                  aria-invalid={!!fieldErrors.username}
                  className={`pl-10 text-slate-900 ${
                    fieldErrors.username
                      ? "border-red-400 focus-visible:ring-red-400"
                      : "focus-visible:ring-blue-500"
                  }`}
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
                <p className="text-xs text-red-500">{fieldErrors.username}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wider text-slate-600"
              >
                Password
              </Label>
              <div className="relative">
                <Lock
                  className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${
                    fieldErrors.password ? "text-red-400" : "text-slate-400"
                  }`}
                />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isPending}
                  aria-invalid={!!fieldErrors.password}
                  className={`pl-10 text-slate-900 ${
                    fieldErrors.password
                      ? "border-red-400 focus-visible:ring-red-400"
                      : "focus-visible:ring-blue-500"
                  }`}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password)
                      setFieldErrors((p) => ({ ...p, password: undefined }));
                    setServerError("");
                  }}
                />
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-red-500">{fieldErrors.password}</p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={isPending}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 font-medium text-white shadow-md transition-all hover:from-blue-700 hover:to-blue-800 active:scale-[0.99]"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
