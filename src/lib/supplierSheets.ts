import {
  Supplier,
  CreateSupplierPayload,
  UpdateSupplierPayload,
} from "@/types/supplier";
import {
  getSuppliers as getCompanySuppliers,
  addCompany,
  updateCompanyInSheets,
  deleteCompanyFromSheets,
  clearAllCompanies,
} from "@/lib/companySheets";
import type { Company } from "@/types/company";

/**
 * Compatibility layer: reads/writes the merged "Companies" sheet.
 * Maps Company rows (filtered by companyType = Supplier|Both) onto the
 * legacy Supplier shape so downstream consumers (products, FTI, etc.)
 * keep working against the single source of truth.
 */

function toSupplierShape(c: Company): Supplier {
  return {
    id: c.id, // comp_<rowNumber> (row-based ID preserved for row targeting)
    supplierId: c.companyId,
    supplierName: c.companyName,
    tin: c.tin,
    addressLine: c.address,
    city: "",
    province: "",
    country: "",
    deliveryLeadTime: "",
    deliveryTerms: "",
    paymentTerms: "",
    status: c.status,
  };
}

export async function getSuppliers(): Promise<Supplier[]> {
  try {
    const companies = await getCompanySuppliers();
    return companies.map(toSupplierShape);
  } catch (error) {
    console.error("Failed to fetch suppliers from Companies sheet:", error);
    throw error;
  }
}

export async function addSupplier(
  payload: CreateSupplierPayload,
): Promise<Supplier> {
  try {
    const created = await addCompany({
      companyId: payload.supplierId || "",
      companyType: "Supplier",
      companyName: payload.supplierName || "",
      tin: payload.tin || "",
      address: payload.addressLine || "",
      latitude: undefined,
      longitude: undefined,
      status: payload.status,
    });
    return toSupplierShape(created);
  } catch (error) {
    console.error(`Failed to create supplier in Companies sheet:`, error);
    throw error;
  }
}

export async function updateSupplierInSheets(
  payload: UpdateSupplierPayload,
): Promise<Supplier> {
  try {
    const updated = await updateCompanyInSheets({
      id: payload.id,
      companyId: payload.supplierId,
      companyType: "Supplier",
      companyName: payload.supplierName,
      tin: payload.tin,
      address: payload.addressLine,
      status: payload.status,
    });
    return toSupplierShape(updated);
  } catch (error) {
    console.error(
      `Failed to update supplier ${payload.id} in Companies sheet:`,
      error,
    );
    throw error;
  }
}

export async function clearAllSuppliers(): Promise<void> {
  try {
    // Compat behavior: the old suppliers import flow wiped the entire sheet.
    await clearAllCompanies();
  } catch (error) {
    console.error("Failed to clear companies from Google Sheets:", error);
    throw error;
  }
}

export async function deleteSupplierFromSheets(id: string): Promise<void> {
  try {
    await deleteCompanyFromSheets(id);
  } catch (error) {
    console.error(
      `Failed to clear supplier row ${id} from Companies sheet:`,
      error,
    );
    throw error;
  }
}
