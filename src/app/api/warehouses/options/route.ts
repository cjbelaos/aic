import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getCompanies } from "@/lib/companySheets";
import { getWarehouses } from "@/lib/warehouseSheets";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const [companies, warehouses] = await Promise.all([getCompanies(), getWarehouses()]);
    const company = companies.find((item) => item.companyId === "COMP-7" && item.status === "active");
    const options = [
      ...(company ? [{ id: `company_${company.companyId}`, kind: "company", label: `${company.companyName} — Main Company Address`, companyId: company.companyId, address: company.address }] : []),
      ...warehouses.filter((item) => item.companyId === "COMP-7" && item.active).map((item) => ({ id: item.id, kind: "warehouse", label: `${item.code} — ${item.name}`, companyId: item.companyId, address: [item.addressLines, item.cityProvincePostal].filter(Boolean).join("\n"), contact: item.contactPersonPhone })),
    ];
    return NextResponse.json(options);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load delivery locations." }, { status: 500 });
  }
}
