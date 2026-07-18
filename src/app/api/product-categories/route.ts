import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getProductCategories,
  addProductCategory,
} from "@/lib/productCategorySheets";
import { CreateProductCategoryPayload } from "@/types/product-category";

/**
 * GET /api/product-categories
 * Fetches all product categories from the Google Sheet.
 */
export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const categories = await getProductCategories();
    return NextResponse.json(categories, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch product categories.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/product-categories
 * Creates a new product category entry.
 */
export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateProductCategoryPayload = await request.json();

    // Validate required fields
    if (!body.code?.trim()) {
      return NextResponse.json(
        { error: "Category code is required." },
        { status: 400 },
      );
    }
    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Category name is required." },
        { status: 400 },
      );
    }

    const created = await addProductCategory(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create product category.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
