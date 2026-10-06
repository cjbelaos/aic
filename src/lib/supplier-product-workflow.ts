import type { Product } from "@/types/product";

/** Remember a created product before linking it, so failed links can be retried. */
export async function saveSupplierProductWithProduct<T>(options: {
  productId: string;
  createProduct?: () => Promise<Product | null>;
  rememberProduct: (product: Product) => void;
  saveSupplierProduct: (productId: string) => Promise<T>;
}): Promise<T> {
  let productId = options.productId;
  if (options.createProduct) {
    const product = await options.createProduct();
    if (!product) throw new Error("Product creation did not return a product.");
    productId = product.productId ?? product.id;
    if (!productId) throw new Error("Created product has no ID.");
    options.rememberProduct(product);
  }
  if (!productId) throw new Error("Select a product before saving the supplier link.");
  return options.saveSupplierProduct(productId);
}
