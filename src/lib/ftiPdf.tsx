import React from "react";
import path from "node:path";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { FTIRequestFull } from "@/types/fti";

const styles = StyleSheet.create({
  page: { padding: 28, paddingBottom: 45, fontSize: 8, fontFamily: "Helvetica" },
  header: { borderTopWidth: 3, borderBottomWidth: 1, borderColor: "#00a2e8", padding: 10, marginBottom: 12, flexDirection: "row", alignItems: "center" },
  logo: { width: 58, height: 45, objectFit: "contain", marginRight: 12 },
  company: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 7, marginBottom: 3 },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center", marginVertical: 12 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderLeftWidth: 0.5, borderColor: "#444" },
  cell: { padding: 4, borderRightWidth: 0.5, borderColor: "#444", fontSize: 7 },
  heading: { backgroundColor: "#eeeeee", borderTopWidth: 0.5, fontFamily: "Helvetica-Bold" },
  totals: { marginTop: 10, textAlign: "right", fontFamily: "Helvetica-Bold" },
  signatures: { flexDirection: "row", justifyContent: "space-between", marginTop: 32 },
  signature: { width: 110, height: 42, objectFit: "contain" },
  footer: { position: "absolute", bottom: 18, left: 28, right: 28, textAlign: "center", fontSize: 7, color: "#555" },
});
const widths = [10, 16, 18, 6, 8, 7, 13, 8, 7, 7];
const money = (n: number) => n.toFixed(2);

export async function renderFTIPdf(
  full: FTIRequestFull,
  miscellaneous: { code: string; description: string }[],
  signature?: Buffer,
): Promise<Buffer> {
  const rows = [...full.details].sort((a, b) => a.date.localeCompare(b.date));
  const fuel = rows.reduce((sum, row) => sum + row.fuelSubTotal, 0);
  const toll = rows.reduce((sum, row) => sum + row.tollFee, 0);
  const misc = rows.reduce((sum, row) => sum + row.expenses.reduce((s, e) => s + e.amount, 0), 0);
  const tableRow = (values: string[], key: string, heading = false) => (
    <View key={key} style={heading ? [styles.row, styles.heading] : styles.row} wrap={false}>
      {values.map((value, index) => <Text key={index} style={[styles.cell, { width: `${widths[index]}%` }]}>{value}</Text>)}
    </View>
  );
  return renderToBuffer(
    <Document title={`FTI ${full.controlNo}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={path.join(process.cwd(), "public", "logo.png")} style={styles.logo} />
          <View>
            <Text style={styles.company}>AERICH INNOVATION CORP.</Text>
            <Text style={styles.subtitle}>BLK 4, LOT 2 Bamboo Orchard Subdivision, Brgy. Banay Banay, Cabuyao City, Laguna</Text>
            <Text style={styles.subtitle}>aerichinnovationcorp@gmail.com | 09171832745 / 09399063645</Text>
            <Text>FTI REF: {full.controlNo} | Technician: {full.userName}</Text>
          </View>
        </View>
        <Text style={styles.title}>ITINERARY BUDGET REQUEST FORM</Text>
        <Text style={styles.subtitle}>Generated: {new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Philippine time) | Amounts in PHP</Text>
        {tableRow(["Date", "Itinerary", "Description", "KM", "Fuel price", "Toll", "Misc", "Misc amount", "Fuel", "Total"], "heading", true)}
        {rows.flatMap(detail => {
          const expenses = detail.expenses.length ? detail.expenses : [null];
          const total = detail.fuelSubTotal + detail.tollFee + detail.expenses.reduce((s, e) => s + e.amount, 0);
          return expenses.map((expense, index) => tableRow([
            index ? "" : detail.date, index ? "" : detail.itinerary, index ? "" : detail.description,
            index ? "" : money(detail.km), index ? "" : money(detail.fuelPrice), index ? "" : money(detail.tollFee),
            expense ? miscellaneous.find(m => m.code === expense.miscCode)?.description || expense.miscCode : "",
            expense ? money(expense.amount) : "", index ? "" : money(detail.fuelSubTotal), index ? "" : money(total),
          ], `${detail.detailId}-${index}`));
        })}
        <View wrap={false}>
          <Text style={styles.totals}>Toll: {money(toll)} | Miscellaneous: {money(misc)} | Fuel: {money(fuel)}</Text>
          <Text style={styles.totals}>Total Requested Budget: PHP {money(full.totalAmount)}</Text>
          <View style={styles.signatures}>
            <Text>Prepared by: {full.userName}</Text>
            <View>
              {signature && full.status === "APPROVED" ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={signature} style={styles.signature} />
              ) : null}
              <Text>Approved by: {full.status === "APPROVED" ? full.approvedByName || "" : ""}</Text>
            </View>
            <View><Text>Released Cash by:</Text><Text style={{ marginTop: 24 }}>Received And Acknowledge by:</Text></View>
          </View>
        </View>
        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `${full.controlNo} | Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>,
  );
}
