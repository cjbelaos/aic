// Water Treatment System Service Report - pure domain helpers for the
// WaterTreatmentServiceReportDetails tab contract, the grouped form sections,
// equipment choices, and the PDF data mapping.
//
// Pure module: imported by the repository, validation, PDF renderer, focused
// Node tests, AND browser components. Never import Google or node-only APIs.

import type {
  EquipmentStatus,
  WaterTreatmentServiceReportDetails,
} from "../../types/serviceReport.ts";
import { WATER_TREATMENT_DETAILS_ROW_WIDTH } from "./constants.ts";

// ---- Row mapping (89 columns) --------------------------------------

export function waterTreatmentDetailsFromRow(row: unknown[]): WaterTreatmentServiceReportDetails {
  const r = row.length >= WATER_TREATMENT_DETAILS_ROW_WIDTH
    ? row
    : [...row, ...Array<unknown>(WATER_TREATMENT_DETAILS_ROW_WIDTH - row.length).fill("")];
  const text = (value: unknown): string => String(value ?? "").trim();
  const status = (value: unknown): EquipmentStatus => {
    const trimmed = text(value);
    return trimmed === "WORKING" || trimmed === "DEFECTIVE" ? trimmed : "";
  };
  return {
    serviceReportId: text(r[0]),
    emailAddress: text(r[1]),
    feedTdsBefore: text(r[2]),
    feedTdsAfter: text(r[3]),
    preFilterInletPressureBefore: text(r[4]),
    preFilterInletPressureAfter: text(r[5]),
    ro1aPureTdsBefore: text(r[6]),
    ro1aPureTdsAfter: text(r[7]),
    ro1aInletPressureBefore: text(r[8]),
    ro1aInletPressureAfter: text(r[9]),
    ro1aConcentratePressureBefore: text(r[10]),
    ro1aConcentratePressureAfter: text(r[11]),
    ro1aPureFlowBefore: text(r[12]),
    ro1aPureFlowAfter: text(r[13]),
    ro1aConcentrateFlowBefore: text(r[14]),
    ro1aConcentrateFlowAfter: text(r[15]),
    ro1bPureTdsBefore: text(r[16]),
    ro1bPureTdsAfter: text(r[17]),
    ro1bInletPressureBefore: text(r[18]),
    ro1bInletPressureAfter: text(r[19]),
    ro1bConcentratePressureBefore: text(r[20]),
    ro1bConcentratePressureAfter: text(r[21]),
    ro1bPureFlowBefore: text(r[22]),
    ro1bPureFlowAfter: text(r[23]),
    ro1bConcentrateFlowBefore: text(r[24]),
    ro1bConcentrateFlowAfter: text(r[25]),
    ro2PureTdsBefore: text(r[26]),
    ro2PureTdsAfter: text(r[27]),
    ro2InletPressureBefore: text(r[28]),
    ro2InletPressureAfter: text(r[29]),
    ro2ConcentratePressureBefore: text(r[30]),
    ro2ConcentratePressureAfter: text(r[31]),
    ro2PureFlowBefore: text(r[32]),
    ro2PureFlowAfter: text(r[33]),
    ro2ConcentrateFlowBefore: text(r[34]),
    ro2ConcentrateFlowAfter: text(r[35]),
    startLoopPressureBefore: text(r[36]),
    startLoopPressureAfter: text(r[37]),
    endLoopPressureBefore: text(r[38]),
    endLoopPressureAfter: text(r[39]),
    preMediaPressureBefore: text(r[40]),
    preMediaPressureAfter: text(r[41]),
    postMediaPressureBefore: text(r[42]),
    postMediaPressureAfter: text(r[43]),
    postCarbon1PressureBefore: text(r[44]),
    postCarbon1PressureAfter: text(r[45]),
    postCarbon2PressureBefore: text(r[46]),
    postCarbon2PressureAfter: text(r[47]),
    postSoftenerPressureBefore: text(r[48]),
    postSoftenerPressureAfter: text(r[49]),
    brineTankLevelBefore: text(r[50]),
    brineTankLevelAfter: text(r[51]),
    microbiologicalWaterSampleResult: text(r[52]),
    physicalChemicalWaterSampleResult: text(r[53]),
    rawTankStatus: status(r[54]),
    rawTankLowLevelSensorStatus: status(r[55]),
    rawTankFloatValveStatus: status(r[56]),
    rawTankFullRefillStatus: status(r[57]),
    multiMediaControlValveStatus: status(r[58]),
    carbon1ControlValveStatus: status(r[59]),
    carbon2ControlValveStatus: status(r[60]),
    softener1ControlValveStatus: status(r[61]),
    softener2ControlValveStatus: status(r[62]),
    rawPumpAStatus: status(r[63]),
    rawPumpApcStatus: status(r[64]),
    rawPumpBStatus: status(r[65]),
    rawPumpBApcStatus: status(r[66]),
    cipLowLevelSensorStatus: status(r[67]),
    cipFullRefillStatus: status(r[68]),
    roControlPanelTerminalStatus: status(r[69]),
    feedControlPanelTerminalStatus: status(r[70]),
    distributionControlPanelTerminalStatus: status(r[71]),
    ro1PumpStatus: status(r[72]),
    ro2PumpStatus: status(r[73]),
    ro1MembraneStatus: status(r[74]),
    ro2MembraneStatus: status(r[75]),
    ro1ProductTankLowLevelSensorStatus: status(r[76]),
    ro1ProductTankFullRefillSensorStatus: status(r[77]),
    ro2ProductTankLowLevelSensorStatus: status(r[78]),
    ro2ProductTankFullRefillSensorStatus: status(r[79]),
    distributionPumpStatus: status(r[80]),
    pressureSensorsStatus: status(r[81]),
    uvLightStatus: status(r[82]),
    remarks: text(r[83]),
    recommendation: text(r[84]),
    createdAt: text(r[85]),
    createdBy: text(r[86]),
    updatedAt: text(r[87]),
    updatedBy: text(r[88]),
  };
}

export function waterTreatmentDetailsToRow(details: WaterTreatmentServiceReportDetails): (string | number)[] {
  return [
    details.serviceReportId, // 0
    details.emailAddress, // 1
    details.feedTdsBefore, // 2
    details.feedTdsAfter, // 3
    details.preFilterInletPressureBefore, // 4
    details.preFilterInletPressureAfter, // 5
    details.ro1aPureTdsBefore, // 6
    details.ro1aPureTdsAfter, // 7
    details.ro1aInletPressureBefore, // 8
    details.ro1aInletPressureAfter, // 9
    details.ro1aConcentratePressureBefore, // 10
    details.ro1aConcentratePressureAfter, // 11
    details.ro1aPureFlowBefore, // 12
    details.ro1aPureFlowAfter, // 13
    details.ro1aConcentrateFlowBefore, // 14
    details.ro1aConcentrateFlowAfter, // 15
    details.ro1bPureTdsBefore, // 16
    details.ro1bPureTdsAfter, // 17
    details.ro1bInletPressureBefore, // 18
    details.ro1bInletPressureAfter, // 19
    details.ro1bConcentratePressureBefore, // 20
    details.ro1bConcentratePressureAfter, // 21
    details.ro1bPureFlowBefore, // 22
    details.ro1bPureFlowAfter, // 23
    details.ro1bConcentrateFlowBefore, // 24
    details.ro1bConcentrateFlowAfter, // 25
    details.ro2PureTdsBefore, // 26
    details.ro2PureTdsAfter, // 27
    details.ro2InletPressureBefore, // 28
    details.ro2InletPressureAfter, // 29
    details.ro2ConcentratePressureBefore, // 30
    details.ro2ConcentratePressureAfter, // 31
    details.ro2PureFlowBefore, // 32
    details.ro2PureFlowAfter, // 33
    details.ro2ConcentrateFlowBefore, // 34
    details.ro2ConcentrateFlowAfter, // 35
    details.startLoopPressureBefore, // 36
    details.startLoopPressureAfter, // 37
    details.endLoopPressureBefore, // 38
    details.endLoopPressureAfter, // 39
    details.preMediaPressureBefore, // 40
    details.preMediaPressureAfter, // 41
    details.postMediaPressureBefore, // 42
    details.postMediaPressureAfter, // 43
    details.postCarbon1PressureBefore, // 44
    details.postCarbon1PressureAfter, // 45
    details.postCarbon2PressureBefore, // 46
    details.postCarbon2PressureAfter, // 47
    details.postSoftenerPressureBefore, // 48
    details.postSoftenerPressureAfter, // 49
    details.brineTankLevelBefore, // 50
    details.brineTankLevelAfter, // 51
    details.microbiologicalWaterSampleResult, // 52
    details.physicalChemicalWaterSampleResult, // 53
    details.rawTankStatus, // 54
    details.rawTankLowLevelSensorStatus, // 55
    details.rawTankFloatValveStatus, // 56
    details.rawTankFullRefillStatus, // 57
    details.multiMediaControlValveStatus, // 58
    details.carbon1ControlValveStatus, // 59
    details.carbon2ControlValveStatus, // 60
    details.softener1ControlValveStatus, // 61
    details.softener2ControlValveStatus, // 62
    details.rawPumpAStatus, // 63
    details.rawPumpApcStatus, // 64
    details.rawPumpBStatus, // 65
    details.rawPumpBApcStatus, // 66
    details.cipLowLevelSensorStatus, // 67
    details.cipFullRefillStatus, // 68
    details.roControlPanelTerminalStatus, // 69
    details.feedControlPanelTerminalStatus, // 70
    details.distributionControlPanelTerminalStatus, // 71
    details.ro1PumpStatus, // 72
    details.ro2PumpStatus, // 73
    details.ro1MembraneStatus, // 74
    details.ro2MembraneStatus, // 75
    details.ro1ProductTankLowLevelSensorStatus, // 76
    details.ro1ProductTankFullRefillSensorStatus, // 77
    details.ro2ProductTankLowLevelSensorStatus, // 78
    details.ro2ProductTankFullRefillSensorStatus, // 79
    details.distributionPumpStatus, // 80
    details.pressureSensorsStatus, // 81
    details.uvLightStatus, // 82
    details.remarks, // 83
    details.recommendation, // 84
    details.createdAt, // 85
    details.createdBy, // 86
    details.updatedAt, // 87
    details.updatedBy, // 88
  ];
}

/** Brand-new detail row for a freshly created WATER_TREATMENT report. */
export function emptyWaterTreatmentDetails(
  serviceReportId: string,
  actorUserId: string,
  nowIso: string,
): WaterTreatmentServiceReportDetails {
  const blank = Array<unknown>(84).fill("");
  return waterTreatmentDetailsFromRow([
    serviceReportId, ...blank, nowIso, actorUserId, nowIso, actorUserId,
  ]);
}

/** Suggested private Drive filename for the Water Treatment System PDF. */
export function waterTreatmentPdfFileName(reportNo: string): string {
  const no = reportNo || "DRAFT";
  return `${no.replace(/[^A-Z0-9-]/gi, "_")}-Water-Treatment.pdf`;
}
// ---- Form section metadata (shared by the edit form, detail page, PDF) ----

export interface MeasurementPairField {
  /** Stable base key, e.g. "feedTds". */
  key: string;
  /** Display label, e.g. "Feed TDS". */
  label: string;
  /** Property key on WaterTreatmentServiceReportDetails for Before. */
  beforeKey: string;
  /** Property key on WaterTreatmentServiceReportDetails for After. */
  afterKey: string;
}

export interface EquipmentField {
  /** Property key on WaterTreatmentServiceReportDetails, e.g. "rawTankStatus". */
  key: string;
  /** Display label, e.g. "Raw Tank". */
  label: string;
}

export const WATER_TREATMENT_MEASUREMENT_SECTIONS: ReadonlyArray<{
  title: string;
  fields: MeasurementPairField[];
}> = [
  {
    title: "Water quality and pre-filter",
    fields: [
      { key: "feedTds", label: "Feed TDS", beforeKey: "feedTdsBefore", afterKey: "feedTdsAfter" },
      { key: "preFilterInletPressure", label: "Pre Filter Inlet Pressure", beforeKey: "preFilterInletPressureBefore", afterKey: "preFilterInletPressureAfter" },
    ],
  },
  {
    title: "RO1A",
    fields: [
      { key: "ro1aPureTds", label: "Pure TDS", beforeKey: "ro1aPureTdsBefore", afterKey: "ro1aPureTdsAfter" },
      { key: "ro1aInletPressure", label: "Inlet Pressure", beforeKey: "ro1aInletPressureBefore", afterKey: "ro1aInletPressureAfter" },
      { key: "ro1aConcentratePressure", label: "Concentrate Pressure", beforeKey: "ro1aConcentratePressureBefore", afterKey: "ro1aConcentratePressureAfter" },
      { key: "ro1aPureFlow", label: "Pure Flow", beforeKey: "ro1aPureFlowBefore", afterKey: "ro1aPureFlowAfter" },
      { key: "ro1aConcentrateFlow", label: "Concentrate Flow", beforeKey: "ro1aConcentrateFlowBefore", afterKey: "ro1aConcentrateFlowAfter" },
    ],
  },
  {
    title: "RO1B",
    fields: [
      { key: "ro1bPureTds", label: "Pure TDS", beforeKey: "ro1bPureTdsBefore", afterKey: "ro1bPureTdsAfter" },
      { key: "ro1bInletPressure", label: "Inlet Pressure", beforeKey: "ro1bInletPressureBefore", afterKey: "ro1bInletPressureAfter" },
      { key: "ro1bConcentratePressure", label: "Concentrate Pressure", beforeKey: "ro1bConcentratePressureBefore", afterKey: "ro1bConcentratePressureAfter" },
      { key: "ro1bPureFlow", label: "Pure Flow", beforeKey: "ro1bPureFlowBefore", afterKey: "ro1bPureFlowAfter" },
      { key: "ro1bConcentrateFlow", label: "Concentrate Flow", beforeKey: "ro1bConcentrateFlowBefore", afterKey: "ro1bConcentrateFlowAfter" },
    ],
  },
  {
    title: "RO2",
    fields: [
      { key: "ro2PureTds", label: "Pure TDS", beforeKey: "ro2PureTdsBefore", afterKey: "ro2PureTdsAfter" },
      { key: "ro2InletPressure", label: "Inlet Pressure", beforeKey: "ro2InletPressureBefore", afterKey: "ro2InletPressureAfter" },
      { key: "ro2ConcentratePressure", label: "Concentrate Pressure", beforeKey: "ro2ConcentratePressureBefore", afterKey: "ro2ConcentratePressureAfter" },
      { key: "ro2PureFlow", label: "Pure Flow", beforeKey: "ro2PureFlowBefore", afterKey: "ro2PureFlowAfter" },
      { key: "ro2ConcentrateFlow", label: "Concentrate Flow", beforeKey: "ro2ConcentrateFlowBefore", afterKey: "ro2ConcentrateFlowAfter" },
    ],
  },
  {
    title: "Loop, media, carbon, softener, and brine",
    fields: [
      { key: "startLoopPressure", label: "Start Loop Pressure", beforeKey: "startLoopPressureBefore", afterKey: "startLoopPressureAfter" },
      { key: "endLoopPressure", label: "End Loop Pressure", beforeKey: "endLoopPressureBefore", afterKey: "endLoopPressureAfter" },
      { key: "preMediaPressure", label: "Pre Media Pressure", beforeKey: "preMediaPressureBefore", afterKey: "preMediaPressureAfter" },
      { key: "postMediaPressure", label: "Post Media Pressure", beforeKey: "postMediaPressureBefore", afterKey: "postMediaPressureAfter" },
      { key: "postCarbon1Pressure", label: "Post Carbon 1 Pressure", beforeKey: "postCarbon1PressureBefore", afterKey: "postCarbon1PressureAfter" },
      { key: "postCarbon2Pressure", label: "Post Carbon 2 Pressure", beforeKey: "postCarbon2PressureBefore", afterKey: "postCarbon2PressureAfter" },
      { key: "postSoftenerPressure", label: "Post Softener Pressure", beforeKey: "postSoftenerPressureBefore", afterKey: "postSoftenerPressureAfter" },
      { key: "brineTankLevel", label: "Brine Tank Level", beforeKey: "brineTankLevelBefore", afterKey: "brineTankLevelAfter" },
    ],
  },
];
/** Raw Tank ... UV Light. Exactly WORKING or DEFECTIVE when answered. */
export const WATER_TREATMENT_EQUIPMENT_FIELDS: ReadonlyArray<EquipmentField> = [
  { key: "rawTankStatus", label: "Raw Tank" },
  { key: "rawTankLowLevelSensorStatus", label: "Raw Tank Low Level Sensor" },
  { key: "rawTankFloatValveStatus", label: "Raw Tank Float Valve" },
  { key: "rawTankFullRefillStatus", label: "Raw Tank Full/Refill" },
  { key: "multiMediaControlValveStatus", label: "Multi Media Control Valve" },
  { key: "carbon1ControlValveStatus", label: "Carbon 1 Control Valve" },
  { key: "carbon2ControlValveStatus", label: "Carbon 2 Control Valve" },
  { key: "softener1ControlValveStatus", label: "Softener 1 Control Valve" },
  { key: "softener2ControlValveStatus", label: "Softener 2 Control Valve" },
  { key: "rawPumpAStatus", label: "Raw Pump A" },
  { key: "rawPumpApcStatus", label: "Raw Pump A - APC" },
  { key: "rawPumpBStatus", label: "Raw Pump B" },
  { key: "rawPumpBApcStatus", label: "Raw Pump B - APC" },
  { key: "cipLowLevelSensorStatus", label: "CIP Low Level Sensor" },
  { key: "cipFullRefillStatus", label: "CIP Full/Refill" },
  { key: "roControlPanelTerminalStatus", label: "RO Control Panel Terminal" },
  { key: "feedControlPanelTerminalStatus", label: "Feed Control Panel Terminal" },
  { key: "distributionControlPanelTerminalStatus", label: "Distribution Control Panel Terminal" },
  { key: "ro1PumpStatus", label: "RO1 Pump" },
  { key: "ro2PumpStatus", label: "RO2 Pump" },
  { key: "ro1MembraneStatus", label: "RO1 Membrane" },
  { key: "ro2MembraneStatus", label: "RO2 Membrane" },
  { key: "ro1ProductTankLowLevelSensorStatus", label: "RO1 Product Tank Low Level Sensor" },
  { key: "ro1ProductTankFullRefillSensorStatus", label: "RO1 Product Tank Full/Refill Sensor" },
  { key: "ro2ProductTankLowLevelSensorStatus", label: "RO2 Product Tank Low Level Sensor" },
  { key: "ro2ProductTankFullRefillSensorStatus", label: "RO2 Product Tank Full/Refill Sensor" },
  { key: "distributionPumpStatus", label: "Distribution Pump" },
  { key: "pressureSensorsStatus", label: "Pressure Sensors" },
  { key: "uvLightStatus", label: "UV Light" },
];

export const WATER_TREATMENT_SAMPLE_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "microbiologicalWaterSampleResult", label: "Microbiological Water Sample" },
  { key: "physicalChemicalWaterSampleResult", label: "PhysicalChemical Water Sample" },
];
// ---- PDF data mapping (label/value rows, blanks preserved) ----

export interface WaterTreatmentPdfRow {
  label: string;
  value: string;
}

/** Grouped Before/After rows for the PDF, preserving blank and literal zero. */
export function waterTreatmentPdfMeasurementSections(
  details: WaterTreatmentServiceReportDetails,
): Array<{ title: string; rows: Array<{ label: string; before: string; after: string }> }> {
  return WATER_TREATMENT_MEASUREMENT_SECTIONS.map((section) => ({
    title: section.title,
    rows: section.fields.map((field) => ({
      label: field.label,
      before: details[field.beforeKey as keyof WaterTreatmentServiceReportDetails] as string,
      after: details[field.afterKey as keyof WaterTreatmentServiceReportDetails] as string,
    })),
  }));
}

export function waterTreatmentPdfSampleRows(
  details: WaterTreatmentServiceReportDetails,
): WaterTreatmentPdfRow[] {
  return WATER_TREATMENT_SAMPLE_FIELDS.map((field) => ({
    label: field.label,
    value: details[field.key as keyof WaterTreatmentServiceReportDetails] as string,
  }));
}

export function waterTreatmentPdfEquipmentRows(
  details: WaterTreatmentServiceReportDetails,
): WaterTreatmentPdfRow[] {
  return WATER_TREATMENT_EQUIPMENT_FIELDS.map((field) => ({
    label: field.label,
    value: details[field.key as keyof WaterTreatmentServiceReportDetails] as string,
  }));
}
