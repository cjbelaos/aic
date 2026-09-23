import Image from "next/image";

type LogoLoaderProps = {
  label?: string;
  size?: number;
};

/** A shared, accessible progress indicator for indeterminate data loads. */
export function LogoLoader({ label = "Loading…", size = 72 }: LogoLoaderProps) {
  const logoSize = Math.round(size * 0.55);

  return (
    <div role="status" aria-live="polite" className="inline-flex flex-col items-center gap-3">
      <div
        className="relative grid place-items-center rounded-full"
        style={{ width: size, height: size }}
      >
        <div className="logo-loader-ring absolute inset-0 rounded-full" aria-hidden="true" />
        <Image
          src="/logo.png"
          alt=""
          width={logoSize}
          height={logoSize}
          className="relative object-contain"
          priority
        />
      </div>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export function PageLoader({ label = "Loading…" }: Pick<LogoLoaderProps, "label">) {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center px-3 py-6">
      <LogoLoader label={label} />
    </div>
  );
}
