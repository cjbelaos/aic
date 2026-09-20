import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse } from "@/lib/salesOrders/http-helpers";
import { getCustomerPricesOnly } from "@/lib/customerPriceSheets";
import { getProducts } from "@/lib/productSheets";

/**
 * Customer pricing resolution: effective customer price first, then the
 * product default selling price. The response names the source so the UI can
 * display it and require a reason before overriding.
 */
export async function GET(request: Request) {
  const auth = await requireSalesPermission("so.create");
  if (auth.response) return auth.response;
  try {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId") ?? "";
    const productId = url.searchParams.get("productId") ?? "";
    const businessDate = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    if (!productId) return NextResponse.json({ error: "productId is required." }, { status: 400 });

    const customerPrices = await getCustomerPricesOnly();
    const activePrice = customerPrices
      .filter((price) => price.status === "active" && price.customerId === customerId && price.productId === productId)
      .filter((price) => (!price.effectiveFrom || price.effectiveFrom <= businessDate) && (!price.effectiveTo || price.effectiveTo >= businessDate))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];

    if (activePrice) {
      return NextResponse.json(
        {
          pricePerUnit: activePrice.pricePerUnit,
          source: "CUSTOMER_PRICE",
          customerProductPriceId: activePrice.customerProductPriceId,
          customerProductName: activePrice.customerProductName,
        },
        { status: 200 },
      );
    }

    const product = (await getProducts()).find((candidate) => candidate.productId === productId);
    const defaultPrice = product?.defaultSellingPrice;
    if (defaultPrice === undefined || defaultPrice === null) {
      return NextResponse.json(
        { error: "No price is configured for this product. Supply a manual price." },
        { status: 422 },
      );
    }
    return NextResponse.json({ pricePerUnit: defaultPrice, source: "DEFAULT_PRICE" }, { status: 200 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}