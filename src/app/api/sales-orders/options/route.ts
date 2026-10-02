import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse } from "@/lib/salesOrders/http-helpers";
import { getCompanies } from "@/lib/companySheets";
import { getUsers } from "@/lib/userSheets";
import { getPaymentTerms } from "@/lib/paymentTermSheets";
import { getProductCategories, getProductUnits } from "@/lib/productReferenceSheets";
import { getQuotations } from "@/lib/quotationSheets";
import { SALES_ORDER_CATEGORIES } from "@/types/salesOrder";
import { getProducts } from "@/lib/productSheets";

export async function GET() {
  const auth = await requireSalesPermission("so.create");
  if (auth.response) return auth.response;
  try {
    const [companies, productRows] = await Promise.all([getCompanies(), getProducts()]);
    const customers = companies
      .filter((company) => company.companyType === "Customer" || company.companyType === "Both")
      .filter((company) => company.status !== "inactive")
      .map((company) => ({
        customerId: company.companyId,
        companyName: company.companyName,
        tin: company.tin,
        address: company.address,
      }));
    const users = (await getUsers()).map((user) => ({
      userId: user.userId,
      fullName: user.fullName,
      username: user.username,
    }));
    const terms = (await getPaymentTerms()).map((term) => ({
      paymentTermId: term.paymentTermId,
      name: term.name,
    }));
    const categoryRecords = await getProductCategories();
    const serviceCategory = categoryRecords.find((category) => category.status === "active" && /^services?\s*\/\s*repair$/i.test(category.categoryName.trim()));
    const categories = categoryRecords.map((category) => ({
      productCategoryId: category.productCategoryId,
      categoryName: category.categoryName,
    }));
    const unitRecords = await getProductUnits();
    const serviceUnit = unitRecords.find((unit) => unit.status === "active" && unit.unitCode.trim().toUpperCase() === "SET");
    const units = unitRecords.map((unit) => ({
      unitId: unit.unitId,
      unitCode: unit.unitCode,
      unitName: unit.unitName,
    }));
    const quotations = (await getQuotations())
      .filter((quotation) => quotation.customerId || quotation.customer)
      .map((quotation) => ({
        quotationNo: quotation.quotationNo,
        customer: quotation.customer,
        customerId: quotation.customerId,
        date: quotation.date,
        status: quotation.status,
        amount: quotation.amount,
      }));
    return NextResponse.json(
      {
        customers,
        users,
        terms,
        categories,
        units,
        serviceCategoryName: serviceCategory?.categoryName || null,
        serviceUnitId: serviceUnit?.unitId || null,
        quotations,
        products: productRows
          .filter((product) => product.status === "active")
          .map((product) => ({
            productId: product.productId,
            productCode: product.productCode,
            productName: product.productName,
            productCategoryId: product.productCategoryId,
            unitId: product.unitId,
            defaultSellingPrice: product.defaultSellingPrice ?? null,
          })),
        orderCategories: [...new Set([...categoryRecords.filter((category) => category.status === "active").map((category) => category.categoryName), ...SALES_ORDER_CATEGORIES])],
        assignmentMandatory: false,
      },
      { status: 200 },
    );
  } catch (error) {
    return salesErrorResponse(error);
  }
}
