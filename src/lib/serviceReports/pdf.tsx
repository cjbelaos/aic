// Service Reports — server-side A4 General Service Report PDF.
// Rendered with @react-pdf/renderer (skia) so no browser is required. The
// customer signature (a private Drive PNG) is embedded from its base64 bytes;
// the PDF is uploaded to the same private Drive folder by the service layer.

import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ServiceReport, WaterTreatmentServiceReportDetails } from "@/types/serviceReport";
import {
  waterTreatmentPdfEquipmentRows,
  waterTreatmentPdfMeasurementSections,
  waterTreatmentPdfSampleRows,
} from "./waterTreatmentDetails";
import { REPORT_TYPE_LABELS } from "./labels";

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 60, fontSize: 9, fontFamily: "Helvetica" },
  company: { fontSize: 15, marginBottom: 2 },
  companySub: { fontSize: 8, marginBottom: 12, color: "#444444" },
  titleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  title: { fontSize: 13, fontWeight: "bold" },
  meta: { fontSize: 8, color: "#444444" },
  block: { marginBottom: 10 },
  blockTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 4, color: "#222222" },
  field: { fontSize: 8, marginBottom: 3 },
  signatureBox: { marginTop: 6, borderWidth: 1, borderColor: "#888888", padding: 6 },
  footer: { position: "absolute", bottom: 24, left: 0, right: 0, fontSize: 7, color: "#666666", textAlign: "center" },
});

function row(label: string, value: string) {
  return <Text style={styles.field}>{label}: {value || "—"}</Text>;
}

function block(title: string, children: React.ReactNode) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      {children}
    </View>
  );
}

export interface ServiceReportPdfData {
  report: ServiceReport;
  signaturePngBase64: string;
}

function ServiceReportPdfDocument(data: ServiceReportPdfData) {
  const { report, signaturePngBase64 } = data;
  const displayNo = report.serviceReportNo || "DRAFT";
  const hasSignature = Boolean(report.signatureDriveFileId && signaturePngBase64);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.company}>AIC — General Service Report</Text>
        <Text style={styles.companySub}>Authoritative application record · Version {report.version}</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Service Report {displayNo}</Text>
          <Text style={styles.meta}>Status: {report.status}</Text>
        </View>

        {block("Service Information", (
          <>
            {row("Service Report No.", report.serviceReportNo)}
            {row("Service Invoice No.", report.serviceInvoiceNo)}
            {row("Service date", report.serviceDate.slice(0, 10))}
            {row("Company", report.companyNameSnapshot)}
            {row("Client name", report.clientNameSnapshot)}
            {row("Client address", report.clientAddressSnapshot)}
            {row("Attended by", report.assignedTechnicianNameSnapshot)}
          </>
        ))}

        {block("Work Performed", (
          <>
            {row("Service type", report.serviceType)}
            <Text style={styles.blockTitle}>Field report</Text>
            <Text style={styles.field}>{report.fieldReport || "—"}</Text>
          </>
        ))}

        {report.remarks ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Remarks</Text>
            <Text style={styles.field}>{report.remarks}</Text>
          </View>
        ) : null}

        {block("Customer Acknowledgment", (
          <>
            {row("Acknowledged by", report.acknowledgedByFullName)}
            {row("Representative position/department", report.acknowledgedByPosition)}
            {row("Signed at", report.signedAt)}
            <View style={styles.signatureBox}>
              <Text style={styles.field}>Customer signature</Text>
              {hasSignature ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image
                  style={{ width: 340, height: 110, objectFit: "contain" }}
                  src={`data:image/png;base64,${signaturePngBase64}`}
                />
              ) : (
                <Text style={styles.field}>[Signature pending]</Text>
              )}
            </View>
          </>
        ))}

        <Text style={styles.footer}>
          Generated {new Date().toISOString()} · {displayNo} v{report.version} · AIC Service Report module
        </Text>
      </Page>
    </Document>
  );
}

// ── Water Treatment System Service Report PDF ─────────────────────

const waterTreatmentStyles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 64, fontSize: 8.5, fontFamily: "Helvetica" },
  company: { fontSize: 14, marginBottom: 2 },
  companySub: { fontSize: 8, marginBottom: 12, color: "#444444" },
  titleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  title: { fontSize: 12, fontWeight: "bold" },
  meta: { fontSize: 8, color: "#444444" },
  block: { marginBottom: 10, wrap: false },
  blockTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 4, color: "#222222" },
  field: { fontSize: 8, marginBottom: 3 },
  tableHead: { flexDirection: "row", borderWidth: 1, borderColor: "#999999", backgroundColor: "#eeeeee" },
  tableRow: { flexDirection: "row", borderWidth: 1, borderColor: "#cccccc" },
  tableRowAlt: { flexDirection: "row", borderWidth: 1, borderColor: "#cccccc", backgroundColor: "#f6f6f6" },
  cellLabel: { flex: 2, padding: 3, fontSize: 8 },
  cellValue: { flex: 1, padding: 3, fontSize: 8 },
  headText: { fontSize: 8, fontWeight: "bold", padding: 3 },
  signatureBox: { marginTop: 6, borderWidth: 1, borderColor: "#888888", padding: 6 },
  footer: {
    position: "absolute", bottom: 24, left: 0, right: 0,
    fontSize: 7, color: "#666666", textAlign: "center",
  },
});

function display(value: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : "—";
}

function equipmentDisplay(value: string): string {
  if (value === "WORKING") return "Working";
  if (value === "DEFECTIVE") return "Defective";
  return "—";
}

function waterTreatmentRow(label: string, value: string) {
  return <Text style={waterTreatmentStyles.field}>{label}: {display(value)}</Text>;
}

function measurementTable(
  reportNo: string,
  sections: Array<{ title: string; rows: Array<{ label: string; before: string; after: string }> }>,
) {
  return (
    <>
      {sections.map((section) => (
        <View key={`${reportNo}-${section.title}`} style={waterTreatmentStyles.block} wrap={false}>
          <Text style={waterTreatmentStyles.blockTitle}>{section.title}</Text>
          <View style={waterTreatmentStyles.tableHead}>
            <View style={waterTreatmentStyles.cellLabel}><Text style={waterTreatmentStyles.headText}>Measurement</Text></View>
            <View style={waterTreatmentStyles.cellValue}><Text style={waterTreatmentStyles.headText}>Before</Text></View>
            <View style={waterTreatmentStyles.cellValue}><Text style={waterTreatmentStyles.headText}>After</Text></View>
          </View>
          {section.rows.map((row, index) => (
            <View key={`${reportNo}-${section.title}-${row.label}`} style={index % 2 === 0 ? waterTreatmentStyles.tableRow : waterTreatmentStyles.tableRowAlt}>
              <View style={waterTreatmentStyles.cellLabel}><Text style={waterTreatmentStyles.field}>{row.label}</Text></View>
              <View style={waterTreatmentStyles.cellValue}><Text style={waterTreatmentStyles.field}>{display(row.before)}</Text></View>
              <View style={waterTreatmentStyles.cellValue}><Text style={waterTreatmentStyles.field}>{display(row.after)}</Text></View>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

function equipmentTable(reportNo: string, rows: Array<{ label: string; value: string }>) {
  return (
    <View style={waterTreatmentStyles.block} wrap={false}>
      <Text style={waterTreatmentStyles.blockTitle}>Equipment inspection</Text>
      <View style={waterTreatmentStyles.tableHead}>
        <View style={waterTreatmentStyles.cellLabel}><Text style={waterTreatmentStyles.headText}>Equipment</Text></View>
        <View style={waterTreatmentStyles.cellValue}><Text style={waterTreatmentStyles.headText}>Status</Text></View>
      </View>
      {rows.map((row, index) => (
        <View key={`${reportNo}-${row.label}`} style={index % 2 === 0 ? waterTreatmentStyles.tableRow : waterTreatmentStyles.tableRowAlt}>
          <View style={waterTreatmentStyles.cellLabel}><Text style={waterTreatmentStyles.field}>{row.label}</Text></View>
          <View style={waterTreatmentStyles.cellValue}><Text style={waterTreatmentStyles.field}>{equipmentDisplay(row.value)}</Text></View>
        </View>
      ))}
    </View>
  );
}
export interface WaterTreatmentServiceReportPdfData {
  report: ServiceReport;
  waterTreatmentDetails: WaterTreatmentServiceReportDetails | null;
  signaturePngBase64: string;
}

function WaterTreatmentServiceReportPdfDocument(data: WaterTreatmentServiceReportPdfData) {
  const { report, signaturePngBase64 } = data;
  const details = data.waterTreatmentDetails ?? { serviceReportId: report.serviceReportId, emailAddress: "" } as WaterTreatmentServiceReportDetails;
  const displayNo = report.serviceReportNo || "DRAFT";
  const hasSignature = Boolean(report.signatureDriveFileId && signaturePngBase64);
  const generatedAt = new Date().toISOString();
  return (
    <Document
      title={`${REPORT_TYPE_LABELS.WATER_TREATMENT} ${displayNo}`}
      subject={`Water Treatment System Service Report ${displayNo} — ${report.serviceInvoiceNo}`}
      creator="AIC Service Reports"
    >
      <Page size="A4" style={waterTreatmentStyles.page}>
        <Text style={waterTreatmentStyles.company}>AIC — Water Treatment System Service Report</Text>
        <Text style={waterTreatmentStyles.companySub}>Authoritative application record · Version {report.version}</Text>
        <View style={waterTreatmentStyles.titleRow}>
          <Text style={waterTreatmentStyles.title}>Service Report {displayNo}</Text>
          <Text style={waterTreatmentStyles.meta}>Status: {report.status}</Text>
        </View>

        <View style={waterTreatmentStyles.block} wrap={false}>
          <Text style={waterTreatmentStyles.blockTitle}>Service information</Text>
          {waterTreatmentRow("Service Report No.", report.serviceReportNo)}
          {waterTreatmentRow("Service Invoice No.", report.serviceInvoiceNo)}
          {waterTreatmentRow("Service date", report.serviceDate.slice(0, 10))}
          {waterTreatmentRow("Email", details.emailAddress)}
          {waterTreatmentRow("Client name", report.clientNameSnapshot)}
          {waterTreatmentRow("Client address", report.clientAddressSnapshot)}
          {waterTreatmentRow("Service type", report.serviceType)}
          {waterTreatmentRow("Attended by", report.assignedTechnicianNameSnapshot)}
        </View>

        {measurementTable(displayNo, waterTreatmentPdfMeasurementSections(details))}

        <View style={waterTreatmentStyles.block} wrap={false}>
          <Text style={waterTreatmentStyles.blockTitle}>Water samples</Text>
          {waterTreatmentPdfSampleRows(details).map((row) => waterTreatmentRow(row.label, row.value))}
        </View>

        {equipmentTable(displayNo, waterTreatmentPdfEquipmentRows(details))}

        <View style={waterTreatmentStyles.block} wrap={false}>
          <Text style={waterTreatmentStyles.blockTitle}>Remarks</Text>
          <Text style={waterTreatmentStyles.field}>{details.remarks.trim() ? details.remarks : "Not recorded."}</Text>
        </View>

        <View style={waterTreatmentStyles.block} wrap={false}>
          <Text style={waterTreatmentStyles.blockTitle}>Recommendation</Text>
          <Text style={waterTreatmentStyles.field}>{details.recommendation.trim() ? details.recommendation : "Not recorded."}</Text>
        </View>

        <View style={waterTreatmentStyles.block} wrap={false}>
          <Text style={waterTreatmentStyles.blockTitle}>Customer Acknowledgment</Text>
          {waterTreatmentRow("Acknowledged by", report.acknowledgedByFullName)}
          {waterTreatmentRow("Representative position/department", report.acknowledgedByPosition)}
          {waterTreatmentRow("Signed at", report.signedAt)}
          <View style={waterTreatmentStyles.signatureBox}>
            <Text style={waterTreatmentStyles.field}>Customer signature</Text>
            {hasSignature ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image
                style={{ width: 340, height: 110, objectFit: "contain" }}
                src={`data:image/png;base64,${signaturePngBase64}`}
              />
            ) : (
              <Text style={waterTreatmentStyles.field}>[Signature pending]</Text>
            )}
          </View>
        </View>

        <View
          style={waterTreatmentStyles.footer}
          render={({ pageNumber, subPageNumber }) => (
            <Text style={{ fontSize: 7, color: "#666666", textAlign: "center" }}>
              {displayNo} v{report.version} · Page {pageNumber}{subPageNumber ? `.${subPageNumber}` : ""} · Generated {generatedAt}
            </Text>
          )}
        />
      </Page>
    </Document>
  );
}
export function serviceReportPdfFileName(report: ServiceReport): string {
  const no = report.serviceReportNo || "DRAFT";
  return report.reportType === "WATER_TREATMENT"
    ? `${no.replace(/[^A-Z0-9-]/gi, "_")}-Water-Treatment.pdf`
    : `${no.replace(/[^A-Z0-9-]/gi, "_")}.pdf`;
}

/** Renders the signed report snapshot into a PDF buffer for either type. */
export async function renderServiceReportPdf(
  report: ServiceReport,
  waterTreatmentDetails: WaterTreatmentServiceReportDetails | null,
  signaturePngBase64: string,
): Promise<Buffer> {
  if (report.reportType === "WATER_TREATMENT") {
    return renderToBuffer(
      WaterTreatmentServiceReportPdfDocument({ report, waterTreatmentDetails, signaturePngBase64 }),
    );
  }
  return renderToBuffer(ServiceReportPdfDocument({ report, signaturePngBase64 }));
}

export { ServiceReportPdfDocument, WaterTreatmentServiceReportPdfDocument };