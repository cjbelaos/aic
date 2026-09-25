// Runtime request validation for Sales Order API endpoints. Route handlers are
// thin: they call these parsers, which throw SalesOrderError (400 malformed /
// 422 business) with a fieldErrors map. Never rely on TypeScript casts.

import { badRequest, SalesOrderError } from "./errors.ts";
import { isValidSalesOrderNo } from "./domain.ts";
import { isSalesOrderQuotationSource, resolveSalesOrderQuotation } from "./quotationReference.ts";

export const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export interface ValidatedLineInput {
  salesOrderItemId?: string;
  lineType: "PRODUCT" | "SERVICE";
  productId: string;
  description: string;
  unitId: string;
  unitSnapshot: string;
  customerProductName: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  quantity: number | null;
  unitPrice: number | null;
  priceSource: string;
  priceOverrideReason: string;
  customerProductPriceId: string;
  quotationLineReference: string;
  discountAmount: number;
  taxMode: string;
  taxRate: number;
  orderCategory: string;
}

export function parseLineInput(raw: unknown, index: number): ValidatedLineInput {
  const errors: Record<string, string> = {};
  if (typeof raw !== "object" || raw === null) throw badRequest("Lines must be objects.", { [`lines.${index}`]: "Expected an object." });
  const value = raw as Record<string, unknown>;
  const lineType = typeof value.lineType === "string" && value.lineType.trim().toUpperCase() === "SERVICE" ? "SERVICE" : "PRODUCT";
  const productId = typeof value.productId === "string" ? value.productId.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const unitId = typeof value.unitId === "string" ? value.unitId.trim() : "";
  const unitSnapshot = typeof value.unitSnapshot === "string" && value.unitSnapshot.trim() ? value.unitSnapshot.trim() : unitId;
  const customerProductName = typeof value.customerProductName === "string" ? value.customerProductName.trim() : "";
  const productCodeSnapshot = typeof value.productCodeSnapshot === "string" ? value.productCodeSnapshot.trim() : "";
  const productNameSnapshot = typeof value.productNameSnapshot === "string" ? value.productNameSnapshot.trim() : "";
  const quantity = optionalPositiveNumber(value.quantity, `lines.${index}.quantity`, errors);
  const unitPrice = optionalNonNegativeNumber(value.unitPrice, `lines.${index}.unitPrice`, errors);
  const priceSource = typeof value.priceSource === "string" && value.priceSource.trim() ? value.priceSource.trim().toUpperCase() : "DEFAULT_PRICE";
  const priceOverrideReason = typeof value.priceOverrideReason === "string" ? value.priceOverrideReason.trim() : "";
  const customerProductPriceId = typeof value.customerProductPriceId === "string" ? value.customerProductPriceId.trim() : "";
  const quotationLineReference = typeof value.quotationLineReference === "string" ? value.quotationLineReference.trim() : "";
  const discountAmount = optionalNonNegativeNumber(value.discountAmount, `lines.${index}.discountAmount`, errors);
  const taxMode = typeof value.taxMode === "string" && value.taxMode.trim() ? value.taxMode.trim().toUpperCase() : "VAT_INCLUSIVE";
  const rawRate = value.taxRate === undefined ? 0.12 : value.taxRate;
  const taxRate = numericOr(rawRate, `lines.${index}.taxRate`, errors, 0, 1);
  const orderCategory = typeof value.orderCategory === "string" ? value.orderCategory.trim() : "";
  if (Object.keys(errors).length > 0) throw badRequest("One or more line fields are invalid.", errors);
  const salesOrderItemId = typeof value.salesOrderItemId === "string" ? value.salesOrderItemId : undefined;
  if (salesOrderItemId && !isUuid(salesOrderItemId)) throw badRequest("Invalid sales order line ID.");
  return {
    salesOrderItemId, lineType, productId, description, unitId, unitSnapshot, customerProductName,
    productCodeSnapshot, productNameSnapshot, quantity: quantity ?? null, unitPrice: unitPrice ?? null,
    priceSource, priceOverrideReason, customerProductPriceId, quotationLineReference,
    discountAmount: discountAmount ?? 0, taxMode, taxRate: taxRate ?? 0, orderCategory,
  };
}
// ── helpers ────────────────────────────────────────────────────────────────

function requiredString(value: unknown, key: string, errors: Record<string, string>): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  errors[key] = `${key} is required.`;
  return null;
}

function optionalPositiveNumber(value: unknown, key: string, errors: Record<string, string>): number | null {
  if (value === undefined || value === null || value === "") return null;
  return numericOr(value, key, errors, 0, undefined, { exclusiveMin: true });
}

function optionalNonNegativeNumber(value: unknown, key: string, errors: Record<string, string>): number | null {
  if (value === undefined || value === null || value === "") return null;
  return numericOr(value, key, errors, 0, undefined);
}

function integerNonNegative(value: unknown, key: string, errors: Record<string, string>): number {
  const number = numericOr(value, key, errors, 0, undefined);
  if (number !== undefined && !Number.isInteger(number)) errors[key] = `${key} must be an integer.`;
  return number ?? 0;
}

function numericOr(
  value: unknown,
  key: string,
  errors: Record<string, string>,
  min: number,
  max: number | undefined,
  options: { exclusiveMin?: boolean } = {},
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(number)) {
    errors[key] = `${key} must be a number.`;
    return null;
  }
  if (options.exclusiveMin ? !(number > min) : !(number >= min)) {
    errors[key] = `${key} must be ${options.exclusiveMin ? "greater than" : "at least"} ${min}.`;
    return null;
  }
  if (max !== undefined && number > max) {
    errors[key] = `${key} must be at most ${max}.`;
    return null;
  }
  return number;
}

export { SalesOrderError, isValidSalesOrderNo };
export interface ValidatedCreateOrder {
  commandId: string;
  sourceQuotationNo: string;
  /** Explicit quotation mode ("INTERNAL"/"EXTERNAL"), or "" for legacy payloads. */
  quotationSource: string;
  /** Raw external quotation number echoed back for callers that render the form. */
  externalQuotationNo: string;
  customerId: string;
  customerNameSnapshot: string;
  customerTINSnapshot: string;
  billingAddressSnapshot: string;
  contactId: string;
  contactNameSnapshot: string;
  contactPhoneSnapshot: string;
  deliveryAddressSnapshot: string;
  customerPONo: string;
  paymentTermId: string;
  paymentTermsSnapshot: string;
  receivedDate: string;
  requiredDate: string;
  assignedToUserId: string;
  currency: string;
  remarks: string;
  lines: ValidatedLineInput[];
}

export function parseCreateOrderInput(body: unknown): ValidatedCreateOrder {
  const fieldErrors: Record<string, string> = {};
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const value = body as Record<string, unknown>;
  const commandId = requiredString(value.commandId, "commandId", fieldErrors) ?? "";
  if (commandId && !isUuid(commandId)) fieldErrors.commandId = "commandId must be a UUID.";
  const requiredStringField = (key: string): string => requiredString(value[key], key, fieldErrors) ?? "";
  const optionalStringField = (key: string): string => typeof value[key] === "string" ? value[key].trim() : "";
  const linesRaw = value.lines;
  if (!Array.isArray(linesRaw)) fieldErrors.lines = "Expected an array of lines.";
  const lines = Array.isArray(linesRaw) ? linesRaw.map(parseLineInput) : [];
  // Quotation reference: an existing quotation (default) or a manually entered
  // external number. The modes are mutually exclusive and an external number
  // must not be blank; legacy payloads without a mode are unchanged.
  const quotationSourceRaw = optionalStringField("quotationSource").toUpperCase();
  if (quotationSourceRaw && !isSalesOrderQuotationSource(quotationSourceRaw)) {
    fieldErrors.quotationSource = "quotationSource must be INTERNAL or EXTERNAL.";
  }
  const externalQuotationNoRaw = optionalStringField("externalQuotationNo");
  const quotation = resolveSalesOrderQuotation({
    quotationSource: quotationSourceRaw,
    quotationNo: optionalStringField("sourceQuotationNo"),
    externalQuotationNo: externalQuotationNoRaw,
  });
  if (quotation.error) {
    fieldErrors[quotationSourceRaw === "EXTERNAL" ? "externalQuotationNo" : "sourceQuotationNo"] = quotation.error;
  }
  const result: ValidatedCreateOrder = {
    commandId,
    sourceQuotationNo: quotation.quotationNo,
    quotationSource: quotation.source ?? "",
    externalQuotationNo: quotation.source === "EXTERNAL" ? quotation.quotationNo : externalQuotationNoRaw,
    customerId: requiredStringField("customerId"),
    customerNameSnapshot: optionalStringField("customerNameSnapshot"),
    customerTINSnapshot: optionalStringField("customerTINSnapshot"),
    billingAddressSnapshot: optionalStringField("billingAddressSnapshot"),
    contactId: optionalStringField("contactId"),
    contactNameSnapshot: optionalStringField("contactNameSnapshot"),
    contactPhoneSnapshot: optionalStringField("contactPhoneSnapshot"),
    deliveryAddressSnapshot: optionalStringField("deliveryAddressSnapshot"),
    customerPONo: typeof value.customerPONo === "string" ? value.customerPONo : "",
    paymentTermId: optionalStringField("paymentTermId"),
    paymentTermsSnapshot: optionalStringField("paymentTermsSnapshot"),
    receivedDate: requiredStringField("receivedDate"),
    requiredDate: optionalStringField("requiredDate"),
    assignedToUserId: optionalStringField("assignedToUserId"),
    currency: typeof value.currency === "string" && value.currency.trim() ? value.currency.trim().toUpperCase() : "PHP",
    remarks: optionalStringField("remarks"),
    lines,
  };
  if (Object.keys(fieldErrors).length > 0) throw badRequest("Invalid create-order payload.", fieldErrors);
  return result;
}
export interface ValidatedUpdateOrder {
  commandId: string;
  expectedVersion: number;
  receivedDate?: string;
  requiredDate?: string;
  assignedToUserId?: string;
  customerPONo?: string;
  paymentTermId?: string;
  paymentTermsSnapshot?: string;
  remarks?: string;
  customerId?: string;
  customerNameSnapshot?: string;
  customerTINSnapshot?: string;
  billingAddressSnapshot?: string;
  contactId?: string;
  contactNameSnapshot?: string;
  contactPhoneSnapshot?: string;
  deliveryAddressSnapshot?: string;
  lines?: ValidatedLineInput[];
}

export function parseUpdateOrderInput(body: unknown): ValidatedUpdateOrder {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const value = body as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  const commandId = requiredString(value.commandId, "commandId", fieldErrors) ?? "";
  if (commandId && !isUuid(commandId)) fieldErrors.commandId = "commandId must be a UUID.";
  const expectedVersion = integerNonNegative(value.expectedVersion, "expectedVersion", fieldErrors);
  const optional = (key: string): string | undefined => typeof value[key] === "string" ? value[key] : undefined;
  const linesRaw = value.lines;
  if (linesRaw !== undefined && !Array.isArray(linesRaw)) fieldErrors.lines = "Expected an array of lines.";
  const lines = Array.isArray(linesRaw) ? linesRaw.map(parseLineInput) : undefined;
  if (Object.keys(fieldErrors).length > 0) throw badRequest("Invalid update-order payload.", fieldErrors);
  return {
    commandId,
    expectedVersion,
    receivedDate: typeof value.receivedDate === "string" ? value.receivedDate : undefined,
    requiredDate: optional("requiredDate"),
    assignedToUserId: optional("assignedToUserId"),
    customerPONo: typeof value.customerPONo === "string" ? value.customerPONo : undefined,
    paymentTermId: optional("paymentTermId"),
    paymentTermsSnapshot: optional("paymentTermsSnapshot"),
    remarks: optional("remarks"),
    customerId: optional("customerId"),
    customerNameSnapshot: optional("customerNameSnapshot"),
    customerTINSnapshot: optional("customerTINSnapshot"),
    billingAddressSnapshot: optional("billingAddressSnapshot"),
    contactId: optional("contactId"),
    contactNameSnapshot: optional("contactNameSnapshot"),
    contactPhoneSnapshot: optional("contactPhoneSnapshot"),
    deliveryAddressSnapshot: optional("deliveryAddressSnapshot"),
    lines,
  };
}

export interface ExpectedVersionInput {
  commandId: string;
  expectedVersion: number;
}

export function parseExpectedVersion(body: unknown): ExpectedVersionInput {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const value = body as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  const commandId = requiredString(value.commandId, "commandId", fieldErrors) ?? "";
  if (commandId && !isUuid(commandId)) fieldErrors.commandId = "commandId must be a UUID.";
  const expectedVersion = integerNonNegative(value.expectedVersion, "expectedVersion", fieldErrors);
  if (Object.keys(fieldErrors).length > 0) throw badRequest("Invalid payload.", fieldErrors);
  return { commandId, expectedVersion };
}
export interface ValidatedCancelOrder {
  commandId: string;
  expectedVersion: number;
  reason: string;
  cancelAllLines: boolean;
  lines: Array<{ salesOrderItemId: string; quantity: number }>;
}

export function parseCancelOrderInput(body: unknown): ValidatedCancelOrder {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const value = body as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  const commandId = requiredString(value.commandId, "commandId", fieldErrors) ?? "";
  if (commandId && !isUuid(commandId)) fieldErrors.commandId = "commandId must be a UUID.";
  const expectedVersion = integerNonNegative(value.expectedVersion, "expectedVersion", fieldErrors);
  const reason = typeof value.reason === "string" && value.reason.trim() ? value.reason.trim() : "";
  if (!reason) fieldErrors.reason = "A cancel reason is required.";
  const lines: Array<{ salesOrderItemId: string; quantity: number }> = [];
  const linesRaw = value.lines;
  if (linesRaw !== undefined) {
    if (!Array.isArray(linesRaw)) fieldErrors.lines = "Expected an array of line cancellations.";
    else {
      linesRaw.forEach((entry, index) => {
        if (typeof entry !== "object" || entry === null) return;
        const line = entry as Record<string, unknown>;
        const id = typeof line.salesOrderItemId === "string" ? line.salesOrderItemId.trim() : "";
        const qty = optionalPositiveNumber(line.quantity, `lines.${index}.quantity`, fieldErrors);
        if (id && qty !== null && qty > 0) lines.push({ salesOrderItemId: id, quantity: qty });
      });
    }
  }
  if (Object.keys(fieldErrors).length > 0) throw badRequest("Invalid cancel payload.", fieldErrors);
  return { commandId, expectedVersion, reason, cancelAllLines: lines.length === 0, lines };
}

export interface ValidatedFulfillmentEntry {
  salesOrderItemId: string;
  type: "DELIVERY" | "SERVICE_COMPLETION" | "REVERSAL";
  quantity: number;
  effectiveDate: string;
  sourceDocumentType: string;
  sourceDocumentId: string;
  sourceLineId: string;
  evidenceDriveFileId: string;
  reversesFulfillmentId: string;
}

export interface ValidatedFulfillment {
  commandId: string;
  expectedVersion: number;
  entries: ValidatedFulfillmentEntry[];
}

export function parseFulfillmentInput(body: unknown): ValidatedFulfillment {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const value = body as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  const commandId = requiredString(value.commandId, "commandId", fieldErrors) ?? "";
  if (commandId && !isUuid(commandId)) fieldErrors.commandId = "commandId must be a UUID.";
  const expectedVersion = integerNonNegative(value.expectedVersion, "expectedVersion", fieldErrors);
  const rawEntries = value.entries;
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    fieldErrors.entries = "At least one fulfillment entry is required.";
    throw badRequest("Invalid fulfillment payload.", fieldErrors);
  }
  const entries: ValidatedFulfillmentEntry[] = [];
  rawEntries.forEach((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      fieldErrors[`entries.${index}`] = "Expected an object.";
      return;
    }
    const entry = raw as Record<string, unknown>;
    const typeRaw = typeof entry.type === "string" ? entry.type.trim().toUpperCase() : "";
    if (!["DELIVERY", "SERVICE_COMPLETION", "REVERSAL"].includes(typeRaw)) {
      fieldErrors[`entries.${index}.type`] = "type must be DELIVERY, SERVICE_COMPLETION or REVERSAL.";
    }
    const id = typeof entry.salesOrderItemId === "string" && entry.salesOrderItemId.trim() ? entry.salesOrderItemId.trim() : "";
    if (!id) fieldErrors[`entries.${index}.salesOrderItemId`] = "salesOrderItemId is required.";
    const qty = optionalPositiveNumber(entry.quantity, `entries.${index}.quantity`, fieldErrors);
    const effectiveDate = typeof entry.effectiveDate === "string" && entry.effectiveDate.trim() ? entry.effectiveDate.trim() : "";
    if (!effectiveDate) fieldErrors[`entries.${index}.effectiveDate`] = "effectiveDate is required.";
    const sourceDocumentType = typeof entry.sourceDocumentType === "string" ? entry.sourceDocumentType.trim().toUpperCase() : "";
    const sourceDocumentId = typeof entry.sourceDocumentId === "string" ? entry.sourceDocumentId.trim() : "";
    const sourceLineId = typeof entry.sourceLineId === "string" ? entry.sourceLineId.trim() : "";
    const reversesFulfillmentId = typeof entry.reversesFulfillmentId === "string" ? entry.reversesFulfillmentId.trim() : "";
    if (typeRaw === "DELIVERY") {
      if (sourceDocumentType !== "DELIVERY_RECEIPT") fieldErrors[`entries.${index}.sourceDocumentType`] = "Delivery fulfillment requires sourceDocumentType DELIVERY_RECEIPT.";
      if (!sourceDocumentId) fieldErrors[`entries.${index}.sourceDocumentId`] = "Delivery fulfillment requires a finalized Delivery Release ID.";
      if (!sourceLineId) fieldErrors[`entries.${index}.sourceLineId`] = "Delivery fulfillment requires an immutable Delivery Release line ID.";
    }
    if (typeRaw === "SERVICE_COMPLETION") {
      if (sourceDocumentType !== "SERVICE_REPORT") fieldErrors[`entries.${index}.sourceDocumentType`] = "Service completion requires sourceDocumentType SERVICE_REPORT.";
      if (!sourceDocumentId) fieldErrors[`entries.${index}.sourceDocumentId`] = "Service completion requires a finalized Service Report ID.";
      if (!sourceLineId) fieldErrors[`entries.${index}.sourceLineId`] = "Service completion requires an immutable Service Report line ID.";
    }
    if (typeRaw === "REVERSAL" && !reversesFulfillmentId) fieldErrors[`entries.${index}.reversesFulfillmentId`] = "A reversal must identify the fulfillment it reverses.";
    entries.push({
      salesOrderItemId: id,
      type: typeRaw as "DELIVERY" | "SERVICE_COMPLETION" | "REVERSAL",
      quantity: qty ?? 0,
      effectiveDate,
      sourceDocumentType,
      sourceDocumentId,
      sourceLineId,
      evidenceDriveFileId: typeof entry.evidenceDriveFileId === "string" ? entry.evidenceDriveFileId : "",
      reversesFulfillmentId,
    });
  });
  if (Object.keys(fieldErrors).length > 0) throw badRequest("Invalid fulfillment payload.", fieldErrors);
  return { commandId, expectedVersion, entries };
}
export interface ValidatedDocument {
  commandId: string;
  documentType: string;
  externalDocumentNo: string;
  driveFileId: string;
  externalUrl: string;
  fileName: string;
  mimeType: string;
  orderVersion: number;
}

export function parseDocumentInput(body: unknown): ValidatedDocument {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const value = body as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  const commandId = requiredString(value.commandId, "commandId", fieldErrors) ?? "";
  if (commandId && !isUuid(commandId)) fieldErrors.commandId = "commandId must be a UUID.";
  const documentType = typeof value.documentType === "string" && value.documentType.trim() ? value.documentType.trim().toUpperCase() : "";
  const allowed = ["CUSTOMER_PO", "QUOTATION", "SALES_ORDER_PDF", "DELIVERY_RECEIPT", "SERVICE_REPORT", "OTHER"];
  if (!allowed.includes(documentType)) fieldErrors.documentType = "documentType is invalid.";
  const externalUrl = typeof value.externalUrl === "string" ? value.externalUrl.trim() : "";
  if (externalUrl && !/^https?:\/\//.test(externalUrl)) fieldErrors.externalUrl = "externalUrl must use http(s).";
  const driveFileId = typeof value.driveFileId === "string" ? value.driveFileId.trim() : "";
  if (!externalUrl && !driveFileId) fieldErrors.external = "Provide an externalUrl or a driveFileId.";
  if (Object.keys(fieldErrors).length > 0) throw badRequest("Invalid document payload.", fieldErrors);
  return {
    commandId,
    documentType,
    externalDocumentNo: typeof value.externalDocumentNo === "string" ? value.externalDocumentNo : "",
    driveFileId,
    externalUrl,
    fileName: typeof value.fileName === "string" ? value.fileName : "",
    mimeType: typeof value.mimeType === "string" ? value.mimeType : "",
    orderVersion: typeof value.orderVersion === "number" && Number.isInteger(value.orderVersion) ? value.orderVersion : 0,
  };
}

export interface ValidatedRetrySync {
  commandId: string;
}

export function parseRetrySyncInput(body: unknown): ValidatedRetrySync {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const value = body as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  const commandId = requiredString(value.commandId, "commandId", fieldErrors) ?? "";
  if (commandId && !isUuid(commandId)) fieldErrors.commandId = "commandId must be a UUID.";
  if (Object.keys(fieldErrors).length > 0) throw badRequest("Invalid sync-retry payload.", fieldErrors);
  return { commandId };
}

export interface ValidatedDocumentLink {
  commandId: string;
  expectedVersion: number;
  documentType: string;
  documentId: string;
  documentLineId: string;
  entries: Array<{ salesOrderItemId: string; linkedQty: number }>;
}

export function parseDocumentLinkInput(body: unknown): ValidatedDocumentLink {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const value = body as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  const commandId = requiredString(value.commandId, "commandId", fieldErrors) ?? "";
  if (commandId && !isUuid(commandId)) fieldErrors.commandId = "commandId must be a UUID.";
  const expectedVersion = integerNonNegative(value.expectedVersion, "expectedVersion", fieldErrors);
  const documentType = typeof value.documentType === "string" && value.documentType.trim() ? value.documentType.trim().toUpperCase() : "";
  const allowed = ["CUSTOMER_PO", "QUOTATION", "SALES_ORDER_PDF", "DELIVERY_RECEIPT", "SERVICE_REPORT", "OTHER"];
  if (!allowed.includes(documentType)) fieldErrors.documentType = "documentType is invalid.";
  const documentId = typeof value.documentId === "string" && value.documentId.trim() ? value.documentId.trim() : "";
  if (!documentId) fieldErrors.documentId = "A source document id (DR/SI) is required.";
  const documentLineId = typeof value.documentLineId === "string" ? value.documentLineId.trim() : "";
  const entries: Array<{ salesOrderItemId: string; linkedQty: number }> = [];
  const rawEntries = value.entries;
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    fieldErrors.entries = "At least one line is required.";
  } else {
    rawEntries.forEach((entry, index) => {
      if (typeof entry !== "object" || entry === null) { fieldErrors[`entries.${index}`] = "Expected a line object."; return; }
      const line = entry as Record<string, unknown>;
      const id = typeof line.salesOrderItemId === "string" ? line.salesOrderItemId.trim() : "";
      if (!id) { fieldErrors[`entries.${index}.salesOrderItemId`] = "salesOrderItemId is required."; return; }
      const qty = numericOr(line.linkedQty, `entries.${index}.linkedQty`, fieldErrors, 0, undefined, { exclusiveMin: true });
      entries.push({ salesOrderItemId: id, linkedQty: qty ?? 0 });
    });
  }
  if (Object.keys(fieldErrors).length > 0) throw badRequest("Invalid document-link payload.", fieldErrors);
  return { commandId, expectedVersion, documentType, documentId, documentLineId, entries };
}

export interface ValidatedFromQuotation {
  commandId: string;
  quotationNo: string;
}

export function parseFromQuotationInput(body: unknown): ValidatedFromQuotation {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const value = body as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  const commandId = requiredString(value.commandId, "commandId", fieldErrors) ?? "";
  if (commandId && !isUuid(commandId)) fieldErrors.commandId = "commandId must be a UUID.";
  const quotationNo = requiredString(value.quotationNo, "quotationNo", fieldErrors) ?? "";
  if (Object.keys(fieldErrors).length > 0) throw badRequest("Invalid from-quotation payload.", fieldErrors);
  return { commandId, quotationNo };
}
