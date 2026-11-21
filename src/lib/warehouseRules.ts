// Warehouse rules shared by the Sheets layer and the API routes.
// Pure (no "@/" imports) so the focused tests can compile it.

/** Next automatic Warehouse ID: highest existing `WH-<n>` + 1. IDs are never reused. */
export function nextWarehouseId(ids: readonly string[]): string {
  const max = ids.reduce((n, id) => {
    const match = /^WH-(\d+)$/i.exec(String(id ?? "").trim());
    return match ? Math.max(n, Number.parseInt(match[1], 10)) : n;
  }, 0);
  return `WH-${max + 1}`;
}

const REQUIRED: { key: "code" | "name" | "addressLines" | "cityProvincePostal"; label: string }[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "addressLines", label: "Address lines" },
  { key: "cityProvincePostal", label: "City / Province / Postal code" },
];

/** Reason a warehouse cannot be saved, or null. `selfWarehouseId` is the warehouse being edited. */
export function validateWarehouse(
  input: { code?: string; name?: string; addressLines?: string; cityProvincePostal?: string },
  existing: readonly { warehouseId: string; code: string; name: string }[],
  selfWarehouseId: string | undefined,
): string | null {
  const missing = REQUIRED.filter(({ key }) => !String(input[key] ?? "").trim()).map(({ label }) => label);
  if (missing.length) return `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required.`;
  const code = String(input.code).trim();
  const clash = existing.find((w) => w.warehouseId !== selfWarehouseId && w.code.trim().toLowerCase() === code.toLowerCase());
  return clash ? `Code ${code.toUpperCase()} is already used by ${clash.name}.` : null;
}

/** Warehouse text is always stored in capitals, however it was typed or pasted. */
const caps = (value: unknown) => String(value ?? "").toUpperCase();

/** Normalises a request body into the editable warehouse fields. */
export function toWarehouseInput(body: {
  code?: unknown; name?: unknown; addressLines?: unknown; cityProvincePostal?: unknown; contactPersonPhone?: unknown; sortOrder?: unknown;
}) {
  return {
    code: caps(body.code),
    name: caps(body.name),
    addressLines: caps(body.addressLines),
    cityProvincePostal: caps(body.cityProvincePostal),
    contactPersonPhone: caps(body.contactPersonPhone),
    sortOrder: Number(body.sortOrder) || 0,
  };
}
