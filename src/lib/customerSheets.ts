import {
  Customer,
  CreateCustomerPayload,
  UpdateCustomerPayload,
} from "@/types/customer";
import {
  getCustomers as getCompanyCustomers,
  addCompany,
  updateCompanyInSheets,
  deleteCompanyFromSheets,
} from "@/lib/companySheets";
import type { Company } from "@/types/company";

/**
 * Compatibility layer: reads/writes the merged "Companies" sheet.
 * Maps Company rows (filtered by companyType = Customer|Both) onto the
 * legacy Customer shape so downstream consumers (FTI, quotations,
 * customer-prices, etc.) keep working against the single source of truth.
 */

function toCustomerShape(c: Company): Customer {
  return {
    id: c.id, // comp_<rowNumber> (row-based ID preserved for row targeting)
    customerName: c.companyName,
    contactPerson: "",
    contactNumber: "",
    email: "",
    tin: c.tin,
    address: c.address,
  };
}

export async function getCustomers(): Promise<Customer[]> {
  try {
    const companies = await getCompanyCustomers();
    return companies.map(toCustomerShape);
  } catch (error) {
    console.error("Failed to fetch customers from Companies sheet:", error);
    throw error;
  }
}

export async function addCustomer(
  payload: CreateCustomerPayload,
): Promise<Customer> {
  try {
    const created = await addCompany({
      companyId: "",
      companyType: "Customer",
      companyName: payload.customerName || "",
      tin: payload.tin || "",
      address: payload.address || "",
      status: "active",
    });
    return toCustomerShape(created);
  } catch (error) {
    console.error(`Failed to create customer in Companies sheet:`, error);
    throw error;
  }
}

export async function updateCustomerInSheets(
  payload: UpdateCustomerPayload,
): Promise<Customer> {
  try {
    const updated = await updateCompanyInSheets({
      id: payload.id,
      companyName: payload.customerName,
      companyType: "Customer",
      tin: payload.tin,
      address: payload.address,
    });
    return toCustomerShape(updated);
  } catch (error) {
    console.error(
      `Failed to update customer ${payload.id} in Companies sheet:`,
      error,
    );
    throw error;
  }
}

export async function deleteCustomerFromSheets(id: string): Promise<void> {
  try {
    await deleteCompanyFromSheets(id);
  } catch (error) {
    console.error(
      `Failed to clear customer row ${id} from Companies sheet:`,
      error,
    );
    throw error;
  }
}
