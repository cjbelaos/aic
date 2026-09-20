// Server-side Sales Order PDF generation using @react-pdf/renderer.
// This module runs in the Next.js server (no browser required): it renders a
// react-pdf Document into a raw PDF buffer via renderToBuffer. The route layer
// persists a SALES_ORDER_PDF document row and returns the artifact; a failed
// render NEVER touches the order, so PDF failure cannot lose the order.

import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { SalesOrder, SalesOrderItem, SalesOrderHistory, SalesOrderDocument } from "@/types/salesOrder";

export interface SalesOrderPdfInput {
  order: SalesOrder;
  items: SalesOrderItem[];
  history: SalesOrderHistory[];
  documents: SalesOrderDocument[];
  totals: { subtotalExTax: number; discountTotal: number; taxTotal: number; grandTotal: number };
}

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 60, fontSize: 9, fontFamily: "Helvetica" },
  company: { fontSize: 14, marginBottom: 2 },
  companySub: { fontSize: 8, marginBottom: 12, color: "#444444" },
  titleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  title: { fontSize: 13, fontWeight: "bold" },
  meta: { fontSize: 8, color: "#444444" },
  block: { marginBottom: 10 },
  blockTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 4, color: "#222222" },
  field: { fontSize: 8, marginBottom: 3 },
  tableHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#666666", paddingTop: 2, paddingBottom: 3, backgroundColor: "#efefef" },
  headCell: { width: "10%", fontSize: 7.5, fontWeight: "bold" },
  headCellWide: { width: "28%", fontSize: 7.5, fontWeight: "bold" },
  row: { flexDirection: "row", paddingTop: 1, paddingBottom: 1 },
  cell: { width: "10%", fontSize: 7.5 },
  cellWide: { width: "28%", fontSize: 7.5 },
  totals: { marginTop: 8, fontSize: 8 },
  remark: { fontSize: 8, marginBottom: 3 },
  footer: { position: "absolute", bottom: 24, left: 0, right: 0, fontSize: 7, color: "#666666", textAlign: "center" },
});

const money = (value: number | null | undefined, currency = "PHP"): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};
const date = (value: string | null | undefined): string => (value ?? "").slice(0, 10) || "—";

function SalesOrderPdfDocument(input: SalesOrderPdfInput) {
  const { order, items, totals } = input;
  const displayNo = order.salesOrderNo || "DRAFT";
  const active = items.filter((item) => item.lineStatus !== "INACTIVE");
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.company}>AIC Internal Operations — Sales Order</Text>
        <Text style={styles.companySub}>Authoritative application record · Version {order.version}</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Sales Order {displayNo}</Text>
          <Text style={styles.meta}>Order status: {order.orderStatus} · Fulfillment: {order.fulfillmentStatus}</Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Customer</Text>
          <Text style={styles.field}>Name: {order.customerNameSnapshot || order.customerId || "—"}</Text>
          <Text style={styles.field}>TIN: {order.customerTINSnapshot || "—"}</Text>
          <Text style={styles.field}>Billing address: {order.billingAddressSnapshot || "—"}</Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Order Details</Text>
          <Text style={styles.field}>Received: {date(order.receivedDate)} · Required: {date(order.requiredDate)}</Text>
          <Text style={styles.field}>Customer PO: {order.customerPONo || "—"} · Quotation: {order.quotationNo || "—"}</Text>
          <Text style={styles.field}>Payment terms: {order.paymentTermsSnapshot || "—"} · Assignee: {order.assignedToUserId || "—"}</Text>
          {order.legacyTrackerNo ? <Text style={styles.field}>Legacy Tracker No: {order.legacyTrackerNo}</Text> : null}
        </View>
<View style={styles.block}>
          <Text style={styles.blockTitle}>Lines</Text>
          <View style={styles.tableHead}>
            <Text style={styles.headCell}>No</Text>
            <Text style={styles.headCellWide}>Item</Text>
            <Text style={styles.headCellWide}>Description</Text>
            <Text style={styles.headCell}>Qty</Text>
            <Text style={styles.headCell}>Price</Text>
            <Text style={styles.headCell}>Total</Text>
          </View>
          {active.length === 0 ? (
            <View style={styles.row}><Text style={styles.cellWide}>No active lines.</Text></View>
          ) : null}
          {active.map((item) => (
            <View style={styles.row} key={item.salesOrderItemId}>
              <Text style={styles.cell}>{item.lineNo}</Text>
              <Text style={styles.cellWide}>{item.productCodeSnapshot || item.productNameSnapshot || "—"}</Text>
              <Text style={styles.cellWide}>{item.description}</Text>
              <Text style={styles.cell}>{item.quantity === null ? "—" : String(item.quantity)} {item.unitSnapshot}</Text>
              <Text style={styles.cell}>{money(item.unitPrice)}</Text>
              <Text style={styles.cell}>{money(item.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <Text>Subtotal (ex-tax): {money(totals.subtotalExTax)}</Text>
          <Text>Discount total: {money(totals.discountTotal)}</Text>
          <Text>Tax total: {money(totals.taxTotal)}</Text>
          <Text>Grand total: {money(totals.grandTotal)}</Text>
        </View>

        {order.remarks ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Remarks</Text>
            <Text style={styles.remark}>{order.remarks}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Generated {new Date().toISOString()} · {displayNo} v{order.version} · Printed from the AIC sales order module
        </Text>
      </Page>
    </Document>
  );
}

export function salesOrderPdfFileName(order: SalesOrder): string {
  const no = order.salesOrderNo || "DRAFT";
  return `${no.replace(/[^A-Z0-9-]/gi, "_")}-v${order.version}.pdf`;
}

/** Renders the order snapshot for `order.version` into a PDF Buffer. */
export async function renderSalesOrderPdf(input: SalesOrderPdfInput): Promise<Buffer> {
  return renderToBuffer(SalesOrderPdfDocument(input));
}

export { SalesOrderPdfDocument };