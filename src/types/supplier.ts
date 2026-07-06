export interface Supplier {
  id: string;
  supplierName: string;
  tin: string;
  address: string;
  status: "active" | "inactive";
}

/**
 * For Creating: All fields except the auto-generated ID.
 */
export type CreateSupplierPayload = Omit<Supplier, "id">;

/**
 * For Updating: ID is required, all other fields are optional.
 */
export type UpdateSupplierPayload = Pick<Supplier, "id"> &
  Partial<Omit<Supplier, "id">>;
