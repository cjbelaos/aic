import { inventoryRoute } from "@/lib/inventory/http";
import { createTransfer } from "@/lib/inventory/service";
import { listTransfers } from "@/lib/inventory/sheets";

export async function GET() {
  return inventoryRoute(async ({ level }) => {
    const transfers = await listTransfers();
    transfers.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { level, transfers };
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    date?: string;
    fromWarehouseId?: string;
    toWarehouseId?: string;
    preparedBy?: string;
    note?: string;
    items?: { productId: string; qty: number; serialNumbers?: string[] }[];
  };
  return inventoryRoute(async ({ actor, session }) => createTransfer({
    date: String(body.date ?? ""),
    fromWarehouseId: String(body.fromWarehouseId ?? ""),
    toWarehouseId: String(body.toWarehouseId ?? ""),
    preparedBy: String(body.preparedBy ?? "").trim() || session.fullName,
    note: String(body.note ?? ""),
    items: (body.items ?? []).map((i) => ({ productId: String(i.productId ?? ""), qty: Number(i.qty), serialNumbers: i.serialNumbers ?? [] })),
  }, actor), 201);
}
