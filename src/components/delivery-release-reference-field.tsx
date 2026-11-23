"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DELIVERY_REFERENCE_MODE_CHOICES,
  NO_CHARGE_REASONS,
  TR_NUMBER_FIELD_LABEL,
  type DeliveryReferenceMode,
  type InvoiceReferenceMode,
} from "@/lib/deliveryReference";

/** Invoices offer only the Sales Order and legacy TR choices. */
const INVOICE_REFERENCE_MODE_CHOICES = DELIVERY_REFERENCE_MODE_CHOICES.filter(
  (choice): choice is (typeof DELIVERY_REFERENCE_MODE_CHOICES)[number] & { value: InvoiceReferenceMode } => choice.value !== "NO_CHARGE",
);

export function InvoiceReferenceTypeSelector({ mode, onChange, disabled }: {
  mode: InvoiceReferenceMode | null;
  onChange: (mode: InvoiceReferenceMode) => void;
  disabled?: boolean;
}) {
  return <fieldset className="space-y-2" disabled={disabled}>
    <legend className="text-sm font-medium">Choose reference type</legend>
    <div className="grid grid-cols-2 gap-2">
      {INVOICE_REFERENCE_MODE_CHOICES.map((choice) => <label key={choice.value} className={`flex items-center gap-2 rounded-md border p-3 text-sm ${mode === choice.value ? "border-primary bg-primary/5" : "border-input"}`}>
        <input type="radio" checked={mode === choice.value} onChange={() => onChange(choice.value)} />
        {choice.value === "TR_NUMBER" ? "Legacy SO / TR Number" : choice.label}
      </label>)}
    </div>
    <p className="text-xs text-muted-foreground">{disabled ? "References are supplied by the linked DR." : mode === "TR_NUMBER" ? "Enter the customer PO and legacy Sales Order / TR number manually." : mode === "SALES_ORDER" ? "The selected Sales Order supplies the customer PO and SO number." : "Choose how to fill the invoice references."}</p>
  </fieldset>;
}

interface Props {
  mode: DeliveryReferenceMode | null;
  onModeChange: (mode: DeliveryReferenceMode) => void;
  salesOrderId: string;
  onSalesOrderIdChange: (value: string) => void;
  salesOrderOptions: { value: string; label: string }[];
  trNo: string;
  onTrNoChange: (value: string) => void;
  /** Sales Order number of the current selection, shown as a hint. */
  selectedSalesOrderNo?: string;
  noChargeReason: string;
  onNoChargeReasonChange: (value: string) => void;
  noChargeNote: string;
  onNoChargeNoteChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Delivery Release reference: a searchable Sales Order picker (current flow), a
 * manual legacy TR Number, or No charge with a reason. The modes are mutually
 * exclusive, so the parent clears the other values whenever the mode changes.
 */
export function DeliveryReleaseReferenceField({
  mode,
  onModeChange,
  salesOrderId,
  onSalesOrderIdChange,
  salesOrderOptions,
  trNo,
  onTrNoChange,
  selectedSalesOrderNo,
  noChargeReason,
  onNoChargeReasonChange,
  noChargeNote,
  onNoChargeNoteChange,
  disabled,
}: Props) {
  return (
    <div className="space-y-2">
      <Label>Choose reference type</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {DELIVERY_REFERENCE_MODE_CHOICES.map((choice) => {
          const selected = mode === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onModeChange(choice.value)}
              className={
                "flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors " +
                (selected
                  ? "border-primary bg-primary/5"
                  : "border-input hover:bg-muted/50")
              }
            >
              <span className="text-sm font-medium">{choice.label}</span>
              <span className="text-xs text-muted-foreground">
                {choice.description}
              </span>
            </button>
          );
        })}
      </div>

      {mode === "SALES_ORDER" ? (
        <>
          <SearchableSelect
            value={salesOrderId}
            onValueChange={onSalesOrderIdChange}
            options={salesOrderOptions}
            placeholder="Select a confirmed Sales Order…"
            searchPlaceholder="Search Sales Order No. or customer…"
            emptyText="No confirmed Sales Orders available"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            {selectedSalesOrderNo
              ? `Linked order: ${selectedSalesOrderNo}`
              : "Optional. Historical releases may remain unlinked."}
          </p>
        </>
      ) : mode === "TR_NUMBER" ? (
        <>
          <Label htmlFor="delivery-reference-tr-number">
            {TR_NUMBER_FIELD_LABEL}
          </Label>
          <Input
            id="delivery-reference-tr-number"
            value={trNo}
            onChange={(event) => onTrNoChange(event.target.value)}
            placeholder="e.g. TR-8891"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            {`Type the legacy ${TR_NUMBER_FIELD_LABEL} by hand. It is never generated, and it replaces any linked Sales Order when you save.`}
          </p>
        </>
      ) : mode === "NO_CHARGE" ? (
        <>
          <Label htmlFor="delivery-reference-no-charge-reason">Reason</Label>
          <Select value={noChargeReason} onValueChange={onNoChargeReasonChange} disabled={disabled}>
            <SelectTrigger id="delivery-reference-no-charge-reason">
              <SelectValue placeholder="Choose a reason" />
            </SelectTrigger>
            <SelectContent>
              {NO_CHARGE_REASONS.map((reason) => (
                <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="delivery-reference-no-charge-note">
            {noChargeReason === "OTHER" ? "Note (required)" : "Note"}
          </Label>
          <Input
            id="delivery-reference-no-charge-note"
            value={noChargeNote}
            onChange={(event) => onNoChargeNoteChange(event.target.value)}
            placeholder={noChargeReason === "OTHER" ? "What is this delivery for?" : "Optional"}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            Free delivery. It never counts against a contract and can&apos;t be invoiced.
          </p>
        </>
      ) : <p className="text-xs text-muted-foreground">Choose a reference type to continue.</p>}
    </div>
  );
}
