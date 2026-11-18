import type { Company } from "@/types/company";
import type { Product } from "@/types/product";
import type { SupplierProduct } from "@/types/supplier-product";

/** One line of the product price comparison: a product and one of its active suppliers. */
export interface PriceComparisonRow {
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string;
  unit: string;
  /** Undefined when the product has no active supplier. */
  supplierName?: string;
  supplierProductCode?: string;
  isPreferred: boolean;
  purchasePrice?: number;
  /** The product's Default Selling Price. */
  sellingPrice?: number;
  /** Set only when both prices are set. */
  margin?: number;
  /** Fraction (0.308 = 30.8%); set only when there is a margin and a selling price above 0. */
  marginPercent?: number;
  /** True on the first row of each product group. */
  isFirstOfProduct: boolean;
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

export function buildPriceComparisonRows(
  products: Product[],
  supplierProducts: SupplierProduct[],
  companies: Company[],
): PriceComparisonRow[] {
  const supplierNames = new Map(companies.map((company) => [company.companyId, company.companyName]));
  const supplierName = (link: SupplierProduct) => supplierNames.get(link.supplierId) || link.supplierId;
  const linksByProduct = new Map<string, SupplierProduct[]>();
  for (const link of supplierProducts) {
    if (link.status !== "active") continue;
    linksByProduct.set(link.productId, [...(linksByProduct.get(link.productId) ?? []), link]);
  }

  return products
    .filter((product) => product.status !== "inactive")
    .sort((a, b) => byText(a.name, b.name) || byText(a.code, b.code))
    .flatMap((product) => {
      const productId = product.productId ?? product.id;
      const sellingPrice = product.defaultSellingPrice;
      const base = {
        productId,
        productCode: product.code,
        productName: product.name,
        categoryName: product.category?.name ?? "",
        unit: product.unit?.code ?? "",
        sellingPrice,
      };
      const links = (linksByProduct.get(productId) ?? []).sort((a, b) =>
        Number(b.isPreferredSupplier) - Number(a.isPreferredSupplier) ||
        a.costPerUnit - b.costPerUnit ||
        byText(supplierName(a), supplierName(b)));
      if (!links.length) return [{ ...base, isPreferred: false, isFirstOfProduct: true }];
      return links.map((link, index): PriceComparisonRow => {
        const margin = sellingPrice === undefined ? undefined : sellingPrice - link.costPerUnit;
        return {
          ...base,
          supplierName: supplierName(link),
          supplierProductCode: link.supplierProductCode,
          isPreferred: link.isPreferredSupplier,
          purchasePrice: link.costPerUnit,
          margin,
          marginPercent: margin !== undefined && sellingPrice && sellingPrice > 0 ? margin / sellingPrice : undefined,
          isFirstOfProduct: index === 0,
        };
      });
    });
}
