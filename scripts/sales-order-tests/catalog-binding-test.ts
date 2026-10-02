import assert from "node:assert/strict";
import { bindNewCatalogLines } from "../../src/lib/salesOrders/catalogBinding.ts";

const products = [{ productId: "P-1", productCode: "P-1", productName: "Pump", productCategoryId: "C-1", unitId: "U-1", status: "active" }];
const categories = [{ productCategoryId: "C-1", categoryCode: "PA", categoryName: "Parts", status: "active" }, { productCategoryId: "C-2", categoryCode: "SE", categoryName: "Services/ Repair", status: "active" }];
const units = [{ unitId: "U-1", unitCode: "PC", unitName: "Piece", status: "active" }, { unitId: "U-2", unitCode: "SET", unitName: "Set", status: "active" }];
const catalog = { products, categories, units };
const product = bindNewCatalogLines([{ lineType: "PRODUCT", productId: "P-1", unitId: "U-2", unitSnapshot: "SET", orderCategory: "Wrong" }], catalog)[0];
assert.equal(product.orderCategory, "Parts");
assert.equal(product.unitId, "U-1");
assert.equal(product.unitSnapshot, "PC");
const service = bindNewCatalogLines([{ lineType: "SERVICE", productId: "P-1", unitId: "U-1", unitSnapshot: "PC", orderCategory: "Parts" }], catalog)[0];
assert.equal(service.orderCategory, "Services/ Repair");
assert.equal(service.unitId, "U-2");
assert.equal(service.unitSnapshot, "SET");
assert.equal(service.productId, "");
assert.throws(() => bindNewCatalogLines([service], { ...catalog, units: units.filter((unit) => unit.unitCode !== "SET") }), /SET/);
assert.equal(bindNewCatalogLines([product], catalog, () => false)[0], product, "historical line retains its saved references");
console.log("catalog-binding-test passed.");
