"use client";

export function UserSignatureImage({ src, alt }: { src?: string; alt: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="e-signature-image" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} />
  );
}
