"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, ChevronDown, PenLine, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import authService from "@/lib/services/auth.service";
import { userService } from "@/lib/services/user.service";
import { toast } from "sonner";

interface StoredUser {
  fullName?: string;
  userName?: string;
  role?: string;
}

export function UserMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<StoredUser>({ userName: "User" });
  const [uploading, setUploading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("auth:user");
      if (raw) {
        const parsed = JSON.parse(raw) as StoredUser;
        setUser(parsed);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    try {
      await authService.logout();
    } catch {
      // continue even if logout request fails
    }
    window.localStorage.removeItem("auth:user");
    router.replace("/");
  };

  const handleSignatureUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate it's a PNG image
    if (!file.type.startsWith("image/")) {
      toast.error(
        "Please select an image file (PNG with transparent background recommended).",
      );
      return;
    }

    setUploading(true);
    const toastId = toast.loading("Uploading signature...");

    try {
      const username = user.userName;
      if (!username) {
        toast.error("User identity not found. Please re-login.");
        return;
      }

      await userService.uploadSignature(file, username);
      toast.success("Signature uploaded successfully!", { id: toastId });
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload signature.", {
        id: toastId,
      });
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const displayName = user.fullName || user.userName || "User";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div ref={menuRef} className="relative">
      <Button
        variant="ghost"
        className="flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold uppercase text-white">
          {initial}
        </span>
        <span className="hidden sm:block">{displayName}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </Button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-1 w-56 origin-top-right rounded-md border border-border bg-popover p-1 shadow-md"
          role="menu"
        >
          <div className="flex items-center gap-2 rounded-sm px-3 py-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{displayName}</p>
              {user.role && (
                <p className="text-xs text-muted-foreground capitalize">
                  {user.role}
                </p>
              )}
            </div>
          </div>

          <div className="my-1 h-px bg-border" />

          {/* Upload Signature Button */}
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PenLine className="h-4 w-4" />
            )}
            {uploading ? "Uploading..." : "Upload e-Signature"}
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleSignatureUpload}
          />

          <div className="my-1 h-px bg-border" />

          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-destructive hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
