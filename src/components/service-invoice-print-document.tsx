"use client";

import type { CSSProperties } from "react";
import type {
  ServiceInvoiceResponse,
  ServiceInvoiceItem,
} from "@/types/serviceInvoice";

/* -----------------------------------------------------------------------------
 * SERVICE INVOICE - HTML / React print document
 *
 * This component mirrors the CURRENT ServiceInvoiceForm Google Sheet tab:
 *   B2           -> Date            (MM/DD/YYYY, right side of header zone)
 *   B5           -> Customer name   (bold, uppercase)
 *   B6           -> TIN
 *   B7           -> Address
 *   row 9        -> pre-printed column headers
 *   rows 10-28   -> items (B=Description, C=Qty, D=Unit Price, E=Amount = CxD)
 *   A35          -> Prepared By ("Full Name - Position Title")
 * ---------------------------------------------------------------------------*/

const PAGE_WIDTH = 794; // px -> 210 mm (A4 @ 96 dpi)
const PAGE_HEIGHT = 1123; // px -> 297 mm (A4 @ 96 dpi)
const FONT_FAMILY = '"Courier New", "Helvetica", sans-serif';

/* ---- Margins (1cm each side) ---- */
const MARGIN_LEFT = 37.8; // 1cm
const MARGIN_RIGHT = 38.3; // 1cm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 718.4px

/* ---- Value placement (px) ---- */
const LEFT_INDENT = MARGIN_LEFT;
const RIGHT_MARGIN = MARGIN_RIGHT;

// Date positioning:
// - From top: 4.9cm (185.22px) to 5.6cm (211.68px) from top
// - From right: 6.2cm (234.36px) to 1cm (37.8px) from right
const DATE_TOP = 187.04; // 5.25cm from top
const DATE_RIGHT = 111.32; // 3.6cm from right

// Customer positioning (B5):
// - From top: 6.8cm (257.04px) to 7.1cm (268.38px) from top
// - From left: 4.1cm (154.98px) from left, extends to right margin
const CUSTOMER_TOP = 249; // 6.95cm from top

// TIN positioning (B6):
// - From top: 7.6cm (287.28px) to 7.9cm (298.62px) from top
const TIN_TOP = 284.33; // 7.75cm from top

// Address positioning (B7):
// - From top: 8.4cm (317.52px) to 8.7cm (328.86px) from top
const ADDRESS_TOP = 316.22; // 8.55cm from top

// Left position for customer, TIN, and address
const CUSTOMER_LEFT = 154.98; // 4.1cm from left

// Item grid
// - First line: 9.8cm to 10.45cm from top
// - Each line: 6.5mm (0.65cm) height
const ITEMS_TOP = 392.11; // 10.125cm from top
const ITEM_LINE_HEIGHT = 24.57; // 6.5mm = 0.65cm = 24.57px
const MAX_ITEM_ROWS = 19; // rows 10-28

// Summary table positioning:
// - 1st row: 22.5cm to 23.1cm from top
// - Row height: 0.6cm = 22.68px
const SUMMARY_ROW_TOP = 910.86; // 22.8cm from top
const SUMMARY_ROW_HEIGHT = 22.68; // 0.6cm = 22.68px

// Summary will be aligned with the Unit Price + Amount columns.
const SUMMARY_RIGHT_MARGIN = 264.57;

/* ---- Additional table (2 rows x 1 col) ---- */
// - Position: 12cm (453.6px) from right
// - Width: 2.75cm (103.95px)
const ADDITIONAL_TABLE_RIGHT = 404.46; // 12cm from right
const ADDITIONAL_TABLE_WIDTH = 103.95; // 2.75cm

/* ---- Prepared By positioning ---- */
// - From top: 26.3cm (994.14px) from top
// - From left: 4.85cm (183.33px) width
// - User position: 1 character above this
// - User Fullname: 1 character above position
const PREPARED_BY_TOP = 945;
const PREPARED_BY_WIDTH = 183.33; // 4.85cm
const PREPARED_BY_LEFT = MARGIN_LEFT;

const FONT_SIZE = 11;

/* -----------------------------------------------------------------------------
 * COLUMN WIDTHS
 * ---------------------------------------------------------------------------*/

// Column widths in cm
const COL_DESC_CM = 10.1; // 10.1cm
const COL_QTY_CM = 1.7; // 1.7cm
const COL_UNIT_CM = 2.0; // 2.0cm
const COL_AMOUNT_CM = 3.6; // 3.6cm

// Convert cm to px (1cm = 37.8px at 96dpi)
const COL_DESC_PX = Math.round(COL_DESC_CM * 37.8);
const COL_QTY_PX = Math.round(COL_QTY_CM * 37.8);
const COL_UNIT_PX = Math.round(COL_UNIT_CM * 37.8);
const COL_AMOUNT_PX = Math.round(COL_AMOUNT_CM * 37.8);

const TOTAL_COL_WIDTH = COL_DESC_PX + COL_QTY_PX + COL_UNIT_PX + COL_AMOUNT_PX;

const SCALE_FACTOR = CONTENT_WIDTH / TOTAL_COL_WIDTH;

// Final column widths
const COL_DESC = Math.round(COL_DESC_PX * SCALE_FACTOR);
const COL_QTY = Math.round(COL_QTY_PX * SCALE_FACTOR);
const COL_UNIT = Math.round(COL_UNIT_PX * SCALE_FACTOR);
const COL_AMOUNT = Math.round(COL_AMOUNT_PX * SCALE_FACTOR);

/* -----------------------------------------------------------------------------
 * HORIZONTAL ADJUSTMENTS
 *
 * Courier New 11px:
 * approximately 6.6px per character.
 * ---------------------------------------------------------------------------*/

const CHAR_WIDTH = 6.6;

const QTY_SHIFT = CHAR_WIDTH * 2; // 2 characters left
const UNIT_SHIFT = CHAR_WIDTH; // 1 character left
const AMOUNT_SHIFT = CHAR_WIDTH * 3; // 3 characters left

/*
 * Summary width = Unit Price + Amount.
 *
 * This makes the summary table span the same horizontal area as:
 *
 *       Unit Price | Amount
 *
 * and allows the Amount/summary values to share the same decimal position.
 */
const SUMMARY_TABLE_WIDTH = COL_UNIT + COL_AMOUNT;

/* -----------------------------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------------------------*/

function formatDateMMDDYYYY(dateStr: string): string {
  if (!dateStr) return "";

  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));

  if (isNaN(d.getTime())) return dateStr;

  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate(),
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

function formatNumber(n: number): string {
  const v = Number.isFinite(n) ? n : 0;

  return v.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* -----------------------------------------------------------------------------
 * DECIMAL-ALIGNED NUMBER
 *
 * Instead of simply right-aligning:
 *
 *       700.00
 *    13,300.00
 *
 * this component fixes the integer portion width so that the "." is always
 * located at the same horizontal position.
 *
 * Result:
 *
 *       700.00
 *    13,300.00
 *          ^
 *          same decimal position
 * ---------------------------------------------------------------------------*/

function DecimalAlignedNumber({ value }: { value: number }) {
  const formatted = formatNumber(value);
  const [integerPart, decimalPart = "00"] = formatted.split(".");

  return (
    <span
      style={{
        display: "inline-grid",
        gridTemplateColumns: "72px 8px 18px",
        justifyContent: "end",
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {/* Integer portion */}
      <span
        style={{
          textAlign: "right",
        }}
      >
        {integerPart}
      </span>

      {/* Decimal point */}
      <span
        style={{
          textAlign: "center",
        }}
      >
        .
      </span>

      {/* Decimal portion */}
      <span
        style={{
          textAlign: "left",
        }}
      >
        {decimalPart}
      </span>
    </span>
  );
}

function normalizeDescription(desc: string): string {
  return (desc || "").trim().toUpperCase();
}

interface ServiceInvoicePrintDocumentProps {
  si: ServiceInvoiceResponse;
  id?: string;
}

export default function ServiceInvoicePrintDocument({
  si,
  id = "si-html-content",
}: ServiceInvoicePrintDocumentProps) {
  const sourceItems: ServiceInvoiceItem[] = (si.items || []).slice(
    0,
    MAX_ITEM_ROWS,
  );

  const rows: Array<ServiceInvoiceItem | null> = Array.from(
    { length: MAX_ITEM_ROWS },
    (_, i) => sourceItems[i] ?? null,
  );

  /* ---------------------------------------------------------------------------
   * TOTALS
   * -------------------------------------------------------------------------*/

  const totalAmount = rows.reduce((sum, item) => {
    if (!item) return sum;

    return sum + (item.amount ?? (item.quantity || 0) * (item.unitPrice || 0));
  }, 0);

  const vatAmount = totalAmount * 0.12;
  const netAmount = totalAmount - vatAmount;
  const withholdingTax = totalAmount * 0.12;
  const totalDue = netAmount + withholdingTax;

  /* ---------------------------------------------------------------------------
   * PREPARED BY
   * -------------------------------------------------------------------------*/

  const rawPreparedBy = si.preparedBy || "";
  const parts = rawPreparedBy.split(" - ");

  const fullName = parts[0] || "";

  // Position comes straight from the Positions sheet (server-resolved via
  // si.preparedByPosition when available), falling back to the value embedded
  // in the preparedBy string ("Full Name - Position Title") if present.


  const parsedPosition = parts.slice(1).join(" - ") || "";
  const positionTitle = si.preparedByPosition || parsedPosition;

  /* ---------------------------------------------------------------------------
   * STYLES
   * -------------------------------------------------------------------------*/

  const numberCellStyle: CSSProperties = {
    fontSize: FONT_SIZE,
    lineHeight: `${ITEM_LINE_HEIGHT}px`,
    padding: 0,
    verticalAlign: "top",
    textAlign: "right",
    height: `${ITEM_LINE_HEIGHT}px`,
    border: "none", // TEMP: visible border
  };

  const descCellStyle: CSSProperties = {
    fontSize: FONT_SIZE,
    lineHeight: `${ITEM_LINE_HEIGHT}px`,
    padding: 0,
    verticalAlign: "top",
    textAlign: "left",
    textTransform: "uppercase",
    height: `${ITEM_LINE_HEIGHT}px`,
    border: "none", // TEMP: visible border
  };

  /*
   * IMPORTANT:
   *
   * padding is 0 here so the decimal-aligned number reaches the exact same
   * right-side reference as the Amount column.
   */
  const summaryCellStyle: CSSProperties = {
    fontSize: FONT_SIZE,
    lineHeight: `${SUMMARY_ROW_HEIGHT}px`,
    padding: 0,
    verticalAlign: "middle",
    height: `${SUMMARY_ROW_HEIGHT}px`,
    textAlign: "right",
  };

  const additionalCellStyle: CSSProperties = {
    fontSize: FONT_SIZE,
    lineHeight: `${SUMMARY_ROW_HEIGHT}px`,
    padding: "0 4px",
    verticalAlign: "middle",
    height: `${SUMMARY_ROW_HEIGHT}px`,
    textAlign: "right",
    border: "none", // TEMP
  };

  /* ---------------------------------------------------------------------------
   * RENDER
   * -------------------------------------------------------------------------*/

  return (
    <div
      id={id}
      style={{
        width: PAGE_WIDTH,
        minHeight: PAGE_HEIGHT,
        fontFamily: FONT_FAMILY,
        padding: 0,
        margin: 0,
        backgroundColor: "#ffffff",
        position: "relative",
        boxSizing: "border-box",
      }}
      className="relative bg-white text-black mx-auto"
    >
      {/* ---------------------------------------------------------------------
       * DATE
       * -------------------------------------------------------------------*/}

      <div
        style={{
          position: "absolute",
          top: DATE_TOP,
          right: DATE_RIGHT,
          fontSize: FONT_SIZE,
          fontFamily: FONT_FAMILY,
        }}
      >
        {formatDateMMDDYYYY(si.date)}
      </div>

      {/* ---------------------------------------------------------------------
       * CUSTOMER
       * -------------------------------------------------------------------*/}

      <div
        style={{
          position: "absolute",
          top: CUSTOMER_TOP,
          left: CUSTOMER_LEFT,
          right: RIGHT_MARGIN,
          fontSize: 13,
          fontWeight: 700,
          textTransform: "uppercase",
          lineHeight: 1.3,
        }}
      >
        {si.companyName || ""}
      </div>

      {/* ---------------------------------------------------------------------
       * TIN
       * -------------------------------------------------------------------*/}

      <div
        style={{
          position: "absolute",
          top: TIN_TOP,
          left: CUSTOMER_LEFT,
          right: RIGHT_MARGIN,
          fontSize: FONT_SIZE,
        }}
      >
        {si.tin || ""}
      </div>

      {/* ---------------------------------------------------------------------
       * ADDRESS
       * -------------------------------------------------------------------*/}

      <div
        style={{
          position: "absolute",
          top: ADDRESS_TOP,
          left: CUSTOMER_LEFT,
          right: RIGHT_MARGIN,
          fontSize: FONT_SIZE,
        }}
      >
        {si.address || ""}
      </div>

      {/* ---------------------------------------------------------------------
       * ITEM TABLE
       * -------------------------------------------------------------------*/}

      <div
        style={{
          position: "absolute",
          top: ITEMS_TOP - 22,
          left: LEFT_INDENT,
          right: RIGHT_MARGIN,
        }}
      >
        <table
          style={{
            width: "100%",
            tableLayout: "fixed",
            borderCollapse: "collapse",
          }}
        >
          <colgroup>
            <col style={{ width: COL_DESC }} />
            <col style={{ width: COL_QTY }} />
            <col style={{ width: COL_UNIT }} />
            <col style={{ width: COL_AMOUNT }} />
          </colgroup>

          <tbody>
            {rows.map((item, idx) => (
              <tr
                key={idx}
                style={{
                  height: `${ITEM_LINE_HEIGHT}px`,
                }}
              >
                {/* Description */}
                <td style={descCellStyle}>
                  {item ? normalizeDescription(item.description) : ""}
                </td>

                {/* Quantity */}
                <td
                  style={{
                    ...numberCellStyle,
                    paddingRight: `${QTY_SHIFT}px`,
                  }}
                >
                  {item &&
                  typeof item.quantity === "number" &&
                  item.quantity !== 0
                    ? item.quantity
                    : ""}
                </td>

                {/* Unit Price */}
                <td
                  style={{
                    ...numberCellStyle,
                    paddingRight: `${UNIT_SHIFT}px`,
                  }}
                >
                  {item &&
                  typeof item.unitPrice === "number" &&
                  item.unitPrice !== 0
                    ? formatNumber(item.unitPrice)
                    : ""}
                </td>

                {/* Amount */}
                <td
                  style={{
                    ...numberCellStyle,
                    paddingRight: `${AMOUNT_SHIFT}px`,
                  }}
                >
                  {item ? (
                    <DecimalAlignedNumber
                      value={
                        item.amount ??
                        (item.quantity || 0) * (item.unitPrice || 0)
                      }
                    />
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------------------------
       * SUMMARY TABLE
       *
       * Width = Unit Price + Amount
       *
       * Right side uses the same AMOUNT_SHIFT as the Amount column.
       * This makes the summary numbers use the same horizontal reference.
       * -------------------------------------------------------------------*/}

      <div
        style={{
          position: "absolute",
          top: SUMMARY_ROW_TOP - SUMMARY_ROW_HEIGHT * 3,

          /*
           * Same 3-character shift as the Amount column.
           */
          right: MARGIN_RIGHT + AMOUNT_SHIFT,

          /*
           * Unit Price + Amount.
           */
          width: SUMMARY_TABLE_WIDTH,
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: "none", // TEMP
            tableLayout: "fixed",
          }}
        >
          <tbody>
            {/* ---------------------------------------------------------------
             * Row 1: Total Amount
             * -------------------------------------------------------------*/}

            <tr
              style={{
                height: `${SUMMARY_ROW_HEIGHT}px`,
              }}
            >
              <td
                style={{
                  ...summaryCellStyle,
                  border: "none",
                }}
              >
                <DecimalAlignedNumber value={totalAmount} />
              </td>
            </tr>

            {/* ---------------------------------------------------------------
             * Row 2: VAT
             * -------------------------------------------------------------*/}

            <tr
              style={{
                height: `${SUMMARY_ROW_HEIGHT}px`,
              }}
            >
              <td
                style={{
                  ...summaryCellStyle,
                  border: "none",
                }}
              >
                <DecimalAlignedNumber value={vatAmount} />
              </td>
            </tr>

            {/* ---------------------------------------------------------------
             * Row 3: Net Amount
             * -------------------------------------------------------------*/}

            <tr
              style={{
                height: `${SUMMARY_ROW_HEIGHT}px`,
              }}
            >
              <td
                style={{
                  ...summaryCellStyle,
                  border: "none",
                }}
              >
                <DecimalAlignedNumber value={netAmount} />
              </td>
            </tr>

            {/* ---------------------------------------------------------------
             * Row 4: "-"
             * -------------------------------------------------------------*/}

            <tr
              style={{
                height: `${SUMMARY_ROW_HEIGHT}px`,
              }}
            >
              <td
                style={{
                  ...summaryCellStyle,
                  textAlign: "center",
                  border: "none",
                }}
              >
                -
              </td>
            </tr>

            {/* ---------------------------------------------------------------
             * Row 5: Withholding Tax
             * -------------------------------------------------------------*/}

            <tr
              style={{
                height: `${SUMMARY_ROW_HEIGHT}px`,
              }}
            >
              <td
                style={{
                  ...summaryCellStyle,
                  border: "none",
                }}
              >
                <DecimalAlignedNumber value={withholdingTax} />
              </td>
            </tr>

            {/* ---------------------------------------------------------------
             * Row 6: 0.00
             * -------------------------------------------------------------*/}

            <tr
              style={{
                height: `${SUMMARY_ROW_HEIGHT}px`,
              }}
            >
              <td
                style={{
                  ...summaryCellStyle,
                  border: "none",
                }}
              >
                <DecimalAlignedNumber value={0} />
              </td>
            </tr>

            {/* ---------------------------------------------------------------
             * Row 7: Total Due
             * -------------------------------------------------------------*/}

            <tr
              style={{
                height: `${SUMMARY_ROW_HEIGHT}px`,
              }}
            >
              <td
                style={{
                  ...summaryCellStyle,
                  fontWeight: "bold",
                  border: "none",
                }}
              >
                <DecimalAlignedNumber value={totalDue} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------------------------
       * ADDITIONAL TABLE
       * -------------------------------------------------------------------*/}

      <div
        style={{
          position: "absolute",
          top: SUMMARY_ROW_TOP - SUMMARY_ROW_HEIGHT * 3,
          right: ADDITIONAL_TABLE_RIGHT,
          width: ADDITIONAL_TABLE_WIDTH,
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: "none", // TEMP
          }}
        >
          <tbody>
            {/* Row 1: Net Amount */}
            <tr
              style={{
                height: `${SUMMARY_ROW_HEIGHT}px`,
              }}
            >
              <td
                style={{
                  ...additionalCellStyle,
                }}
              >
                <DecimalAlignedNumber value={netAmount} />
              </td>
            </tr>

            {/* Row 2: VAT */}
            <tr
              style={{
                height: `${SUMMARY_ROW_HEIGHT}px`,
              }}
            >
              <td
                style={{
                  ...additionalCellStyle,
                }}
              >
                <DecimalAlignedNumber value={vatAmount} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------------------------
       * PREPARED BY
       * -------------------------------------------------------------------*/}

      <div
        style={{
          position: "absolute",
          left: PREPARED_BY_LEFT,
          top: PREPARED_BY_TOP,
          width: PREPARED_BY_WIDTH,
          fontSize: FONT_SIZE,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {/* Full Name */}
        <div
          style={{
            fontWeight: 600,
            lineHeight: 1.2,
            marginBottom: "4px",
          }}
        >
          {fullName}
        </div>

        {/* Position Title */}
        <div
          style={{
            fontSize: FONT_SIZE - 1,
            lineHeight: 1.2,
          }}
        >
          {positionTitle}
        </div>
      </div>
    </div>
  );
}
