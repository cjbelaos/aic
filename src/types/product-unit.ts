export interface ProductUnit {
  id: string;
  name: string;
}

/**
 * For Creating: We require all information EXCEPT the auto-generated ID.
 */
export type CreateProductUnitPayload = Omit<ProductUnit, "id">;

/**
 * For Updating: The ID is strictly required to identify the row,
 * but all other fields are optional (Partial) so you can update individual fields.
 */
export type UpdateProductUnitPayload = Pick<ProductUnit, "id"> &
  Partial<Omit<ProductUnit, "id">>;
