export interface ProductCategory {
  id: string;
  /** Short code identifier (e.g., CO, PA, PR, RE, SU, SE, TR). Acts as a display key. */
  code: string;
  /** Human-readable name (e.g., Consumables, Parts, Project, etc.). */
  name: string;
}

/**
 * For Creating: We require all information EXCEPT the auto-generated ID.
 */
export type CreateProductCategoryPayload = Omit<ProductCategory, "id">;

/**
 * For Updating: The ID is strictly required to identify the row,
 * but all other fields are optional (Partial) so you can update individual fields.
 */
export type UpdateProductCategoryPayload = Pick<ProductCategory, "id"> &
  Partial<Omit<ProductCategory, "id">>;
