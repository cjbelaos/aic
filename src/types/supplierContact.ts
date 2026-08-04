export interface SupplierContact {
  id: string;
  contactId: string;
  supplierId: string;
  fullName: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

export type CreateSupplierContactPayload = Omit<SupplierContact, "id">;

export type UpdateSupplierContactPayload = Pick<SupplierContact, "id"> &
  Partial<Omit<SupplierContact, "id">>;
