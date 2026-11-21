import { inventoryRoute } from "@/lib/inventory/http";
import { decideTransfer } from "@/lib/inventory/service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const body = (await request.json()) as { decision?: string; note?: string };
  return inventoryRoute(async ({ actor }) => {
    if (body.decision !== "approve" && body.decision !== "reject") {
      throw Object.assign(new Error("Decision must be approve or reject."), { status: 400 });
    }
    return decideTransfer(id, body.decision, String(body.note ?? ""), actor);
  });
}
