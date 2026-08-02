"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import authService from "@/lib/services/auth.service";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    authService
      .me()
      .then((res) => {
        if (res.isSuccess) {
          // Refresh stored user info from server
          window.localStorage.setItem(
            "auth:user",
            JSON.stringify({
              userId: res.result?.userId ?? "",
              userName: res.result?.userName ?? "",
              userRoleId: res.result?.userRoleId ?? 2,
            }),
          );
          setReady(true);
        } else {
          router.replace("/");
        }
      })
      .catch(() => {
        router.replace("/");
      });
  }, [router]);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}
