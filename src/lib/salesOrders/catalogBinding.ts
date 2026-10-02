import { validationError } from "./errors.ts";

export type CatalogLine = { lineType: "PRODUCT" | "SERVICE"; productId: string; unitId: string; unitSnapshot: string; orderCategory: string };

/** Resolve references when a line is first added; historical lines retain their snapshots. */
export function bindNewCatalogLines<T extends CatalogLine>(
  lines: T[],
  catalog: {
    products: { productId: string; productName: string; productCategoryId: string; unitId: string; status: string }[];
    categories: { productCategoryId: string; categoryName: string; status: string }[];
    units: { unitId: string; unitCode: string; status: string }[];
  },
  shouldBind: (line: T) => boolean = () => true,
): T[] {
  const serviceCategory = catalog.categories.find((entry) => entry.status === "active" && /^services?\s*\/\s*repair$/i.test(entry.categoryName.trim()));
  const setUnit = catalog.units.find((entry) => entry.status === "active" && entry.unitCode.trim().toUpperCase() === "SET");
  return lines.map((line) => {
    if (!shouldBind(line)) return line;
    if (line.lineType === "SERVICE") {
      if (!serviceCategory) throw validationError("Add an active Service / Repair entry in Product Categories before adding a service line.");
      if (!setUnit) throw validationError("Add an active SET entry in Product Units before adding a service line.");
      return { ...line, productId: "", orderCategory: serviceCategory.categoryName, unitId: setUnit.unitId, unitSnapshot: setUnit.unitCode };
    }
    if (!line.productId) return line;
    const product = catalog.products.find((entry) => entry.productId === line.productId && entry.status === "active");
    if (!product) throw validationError(`Product "${line.productId}" was not found or is inactive.`);
    const category = catalog.categories.find((entry) => entry.productCategoryId === product.productCategoryId);
    const unit = catalog.units.find((entry) => entry.unitId === product.unitId);
    if (!category || !unit) throw validationError(`Product "${product.productName}" has an invalid category or unit.`);
    return { ...line, orderCategory: category.categoryName, unitId: unit.unitId, unitSnapshot: unit.unitCode };
  });
}
