export interface Customer {
  id: string;
  customerName: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
  tin: string;
  address: string;
}

/**
 * For Creating: We require all information EXCEPT the auto-generated ID.
 */
export type CreateCustomerPayload = Omit<Customer, "id">;

/**
 * For Updating: The ID is strictly required to identify the row,
 * but all other fields are optional (Partial) so you can update individual fields.
 */
export type UpdateCustomerPayload = Pick<Customer, "id"> &
  Partial<Omit<Customer, "id">>;
