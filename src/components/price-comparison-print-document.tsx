import type { PriceComparisonRow } from "@/lib/priceComparisonReport";

// Constant stylesheet; rendered inside BusinessDocumentPrintFrame, whose shell sets A4 portrait,
// fixed table layout and a repeating <thead>. One line per row: long names are cut with an ellipsis.
const css = [
  ".price-comparison{font-size:7.5pt;line-height:1.3}",
  ".price-comparison th,.price-comparison td{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:2px 4px}",
  ".price-comparison th{border-bottom:1px solid #17232d;font-size:7pt;text-transform:uppercase}",
  ".price-comparison td{border-bottom:1px solid #e1e5e8}",
  ".price-comparison tr.group-start td{border-top:1px solid #9aa5ad}",
  ".price-comparison tr{break-inside:avoid;page-break-inside:avoid}",
  ".price-comparison .num{text-align:right}",
  ".price-comparison .negative{color:#c00}",
  ".price-comparison .muted{color:#8a959d}",
].join("");

const widths = ["11%", "25%", "6%", "20%", "10%", "10%", "9%", "9%"];
const headers = ["Code", "Product", "Unit", "Supplier", "Purchase Price", "Selling Price", "Margin", "Margin %"];
const numericFrom = 4;

const money = (value?: number) =>
  value === undefined ? "" : value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (value?: number) => (value === undefined ? "" : `${(value * 100).toFixed(1)}%`);

export function PriceComparisonPrintDocument({ rows }: { rows: PriceComparisonRow[] }) {
  return (
    <div className="receipt price-comparison">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <table>
        <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
        <thead>
          <tr>{headers.map((header, index) => <th key={header} className={index >= numericFrom ? "num" : undefined}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const negative = row.margin !== undefined && row.margin < 0 ? " negative" : "";
            const supplier = row.supplierName === undefined ? "(no supplier)" : `${row.supplierName}${row.isPreferred ? " ★" : ""}`;
            return (
              <tr key={`${row.productId}-${index}`} className={row.isFirstOfProduct && index > 0 ? "group-start" : undefined}>
                <td>{row.isFirstOfProduct ? row.productCode : ""}</td>
                <td title={row.productName}>{row.isFirstOfProduct ? row.productName : ""}</td>
                <td>{row.isFirstOfProduct ? row.unit : ""}</td>
                <td title={supplier} className={row.supplierName === undefined ? "muted" : undefined}>{supplier}</td>
                <td className="num">{money(row.purchasePrice)}</td>
                <td className="num">{money(row.sellingPrice)}</td>
                <td className={`num${negative}`}>{money(row.margin)}</td>
                <td className={`num${negative}`}>{percent(row.marginPercent)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
