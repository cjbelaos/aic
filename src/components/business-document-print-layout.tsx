// A separate document keeps dashboard/dialog CSS out of the printed receipt.
export const businessDocumentPrintShell = `<!doctype html><html><head><meta charset="utf-8"><title>Print document</title><style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #17232d; background: #e8ecef; font: 12px/1.45 Arial, sans-serif; }
  .receipt { max-width: 210mm; margin: 20px auto; padding: 12mm; background: white; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th, td { text-align: left; overflow-wrap: anywhere; }
  .heading-cell { padding: 0 0 18px; font-weight: normal; }
  .brand { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 3px solid #17232d; padding-bottom: 14px; }
  .brand img { width: 125px; height: 70px; object-fit: contain; object-position: left center; }
  .company-info { flex: 1; min-width: 0; text-align: left; font-size: 10px; line-height: 1.35; }
  .company-name { font-size: 13px; font-weight: 700; letter-spacing: .2px; }
  .title { text-align: right; }
  h1 { font-size: 22px; letter-spacing: 1px; margin: 0; }
  .number { font-size: 18px; font-weight: bold; }
  .details { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; padding-top: 14px; }
  .label { color: #52616b; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; }
  .customer { font-size: 15px; font-weight: bold; }
  .multiline { white-space: pre-wrap; overflow-wrap: anywhere; }
  .columns th { border-block: 1px solid #17232d; padding: 8px 6px; font-size: 10px; text-transform: uppercase; }
  .item td { padding: 9px 6px; border-bottom: 1px solid #cbd2d8; vertical-align: top; white-space: pre-wrap; }
  .item { break-inside: avoid; page-break-inside: avoid; }
  .qty { text-align: right; }
  .summary { text-align: right; font-size: 11px; margin-top: 10px; }
  .notes { margin-top: 20px; }
  .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 26px; break-inside: avoid; page-break-inside: avoid; }
  .signature { padding-top: 32px; }
  .signature strong { display: block; min-height: 23px; border-bottom: 1px solid #17232d; overflow-wrap: anywhere; }
  .acknowledgment { margin-top: 20px; font-size: 11px; }
  @media print { body { background: white; color: black; } .receipt { max-width: none; margin: 0; padding: 0; } }
</style></head><body></body></html>`;

export function BusinessDocumentHeader({ title, number, draft = false }: { title: string; number: string; draft?: boolean }) {
  return <div className="brand">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/logo.png" alt="Aerich Innovation Corp. logo" />
    <div className="company-info"><div className="company-name">AERICH INNOVATION CORP.</div><div>BLK 4 LOT 2 BAMBOO ORCHARD BANAY - BANAY</div><div>CABUYAO CITY, LAGUNA</div><div>aerichinnovationcorp@gmail.com</div></div>
    <div className="title"><h1>{title}</h1><div className="number">{number}</div>{draft && <div>DRAFT</div>}</div>
  </div>;
}
