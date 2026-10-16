import { NextResponse } from "next/server";
import { ProformaError } from "./domain";
export function proformaError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to process the Proforma Invoice.";
  if (!(error instanceof ProformaError)) console.error("Proforma Invoice error:", message);
  return NextResponse.json({ error: message }, { status: error instanceof ProformaError ? error.status : 500 });
}
