import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getCustomerPrices, addCustomerPrice } from "@/lib/customerPriceSheets";
import { getCustomers } from "@/lib/customerSheets";
import { getProducts } from "@/lib/productSheets";
import { CreateCustomerPricePayload } from "@/types/customer-price";

/**
 * GET /api/customer-prices
 * Fetches all customer prices from the Google Sheet.
 */
export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const prices = await getCustomerPrices();
    return NextResponse.json(prices, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch customer prices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/customer-prices
 * Creates a new customer price entry. Validates:
 * - Customer name exists in the Customers sheet
 * - Product code exists in the Products sheet
 * - Price per unit > 0
 * - Composite unique constraint (customerName + productCode)
 */
export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateCustomerPricePayload = await request.json();

    // Validate required fields
    if (!body.customerName?.trim()) {
      return NextResponse.json(
        { error: "Customer name is required." },
        { status: 400 },
      );
    }
    if (!body.productCode?.trim()) {
      return NextResponse.json(
        { error: "Product code is required." },
        { status: 400 },
      );
    }
    if (!body.pricePerUnit || body.pricePerUnit <= 0) {
      return NextResponse.json(
        {
          error: "Custom Price/Unit must be a positive number greater than 0.",
        },
        { status: 400 },
      );
    }

    // Validate that the referenced customer exists
    const customers = await getCustomers();
    const customerExists = customers.some(
      (c) =>
        c.customerName?.trim().toLowerCase() ===
        body.customerName.trim().toLowerCase(),
    );
    if (!customerExists) {
      return NextResponse.json(
        { error: `Customer "${body.customerName}" not found.` },
        { status: 400 },
      );
    }

    // Validate that the referenced product exists
    const products = await getProducts();
    const productExists = products.some(
      (p) =>
        p.code?.trim().toLowerCase() === body.productCode.trim().toLowerCase(),
    );
    if (!productExists) {
      return NextResponse.json(
        { error: `Product with code "${body.productCode}" not found.` },
        { status: 400 },
      );
    }

    const created = await addCustomerPrice(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create customer price.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
