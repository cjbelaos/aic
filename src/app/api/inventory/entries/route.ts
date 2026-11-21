import { inventoryRoute } from "@/lib/inventory/http";
import { createEntries } from "@/lib/inventory/service";
import type { EntryType } from "@/lib/inventory/domain";

const ENTRY_TYPES: readonly string[] = ["OPENING", "RECEIVED", "RETURN", "ADJUSTMENT"];

/** Adds one or more stock entries of one type at one warehouse. */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    type?: string;
    warehouseId?: string;
    date?: string;
    referenceNo?: string;
    note?: string;
    lines?: { productId: string; qty: number }[];
  };
  const type = String(body.type ?? "").toUpperCase();
  return inventoryRoute(async ({ actor }) => {
    if (!ENTRY_TYPES.includes(type)) throw Object.assign(new Error("Unknown entry type."), { status: 400 });
    const entries = await createEntries({
      type: type as EntryType,
      warehouseId: String(body.warehouseId ?? ""),
      date: String(body.date ?? ""),
      referenceNo: String(body.referenceNo ?? ""),
      note: String(body.note ?? ""),
      lines: (body.lines ?? []).map((l) => ({ productId: String(l.productId ?? ""), qty: Number(l.qty) })),
    }, actor);
    return { entries };
  }, 201);
}
