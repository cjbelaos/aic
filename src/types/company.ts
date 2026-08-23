export type CompanyType = "Supplier" | "Customer" | "Both";

export interface Company {
  id: string; // comp_<rowNumber>
  row: number; // spreadsheet data row (row 1 = header)
  companyId: string; // COMP-1, COMP-2, ...
  companyType: CompanyType;
  companyName: string;
  tin: string;
  address: string;
  latitude: number | undefined;
  longitude: number | undefined;
  status: "active" | "inactive";
}

export type CreateCompanyPayload = Omit<Company, "id" | "row">;

export type CreateCompanyWithContactsPayload = CreateCompanyPayload & {
  contacts?: import("./companyContact").CreateCompanyContactPayload[];
};

export type UpdateCompanyPayload = Pick<Company, "id"> &
  Partial<Omit<Company, "id" | "row">>;
