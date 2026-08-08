export interface CompanyContact {
  id: string;
  contactId: string;
  companyId: string;
  fullName: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

export type CreateCompanyContactPayload = Omit<CompanyContact, "id">;

export type UpdateCompanyContactPayload = Pick<CompanyContact, "id"> &
  Partial<Omit<CompanyContact, "id">>;
