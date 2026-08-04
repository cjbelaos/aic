export interface Supplier {
  id: string;
  supplierId: string;
  supplierName: string;
  tin: string;
  addressLine: string;
  city: string;
  province: string;
  country: string;
  deliveryLeadTime: string;
  deliveryTerms: string;
  paymentTerms: string;
  status: "active" | "inactive";
}

export type CreateSupplierPayload = Omit<Supplier, "id">;

export type UpdateSupplierPayload = Pick<Supplier, "id"> &
  Partial<Omit<Supplier, "id">>;
