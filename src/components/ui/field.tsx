import React from "react";

/**
 * A reusable label + value/children grid layout component.
 * Renders a label in the left column and either a child element or a
 * styled read-only value span in the right column.
 *
 * @example
 * ```tsx
 * <Field label="Customer Name" value="John Doe" />
 * <Field label="Email">
 *   <Input value={email} onChange={...} />
 * </Field>
 * ```
 */
export function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
      <span className="font-semibold">{label}</span>
      {children ?? (
        <span className="min-h-9 rounded border border-input px-3 py-2 bg-white">
          {value || "—"}
        </span>
      )}
    </div>
  );
}
