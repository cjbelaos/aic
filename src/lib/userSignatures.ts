"use client";

import userService from "@/lib/services/user.service";

export type UserSignatureUrls = Record<string, string>;

const getDriveImageUrl = (fileId: string) => `/api/images/drive/${fileId}`;

export function signerNameKey(name: string | undefined): string {
  return (name || "").split(" - ")[0].trim().toLocaleLowerCase();
}

export async function resolveUserSignatureUrls(names: Array<string | undefined>): Promise<UserSignatureUrls> {
  const keys = new Set(names.map(signerNameKey).filter(Boolean));
  if (keys.size === 0) return {};
  const users = await userService.getAllUsers();
  return users.reduce<UserSignatureUrls>((urls, user) => {
    const key = signerNameKey(user.fullName);
    if (keys.has(key) && user.signature) urls[key] = getDriveImageUrl(user.signature);
    return urls;
  }, {});
}
