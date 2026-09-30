"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DELIVERY_REFERENCE_MODE_CHOICES,
  TR_NUMBER_FIELD_LABEL,
  type DeliveryReferenceMode,
} from "@/lib/deliveryReference";

export function InvoiceReferenceTypeSelector({ mode, onChange, disabled }: {
  mode: DeliveryReferenceMode | null;
  onChange: (mode: DeliveryReferenceMode) => void;
  disabled?: boolean;
}) {
  return <fieldset className="space-y-2" disabled={disabled}>
    <legend className="text-sm font-medium">Choose reference type</legend>
    <div className="grid grid-cols-2 gap-2">
      {DELIVERY_REFERENCE_MODE_CHOICES.map((choice) => <label key={choice.value} className={`flex items-center gap-2 rounded-md border p-3 text-sm ${mode === choice.value ? "border-primary bg-primary/5" : "border-input"}`}>
        <input type="radio" checked={mode === choice.value} onChange={() => onChange(choice.value)} />
        {choice.label}
      </label>)}
    </div>
    <p className="text-xs text-muted-foreground">{disabled ? "References are supplied by the linked DR." : mode === "TR_NUMBER" ? "Enter the customer PO and legacy TR number. A Sales Order is still required." : mode === "SALES_ORDER" ? "The selected Sales Order supplies the customer PO and SO number." : "Choose how to fill the invoice references."}</p>
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
  disabled?: boolean;
}

/**
 * Delivery Release reference: either a searchable Sales Order picker (current
 * flow) or a manual legacy TR Number. The two modes are mutually exclusive, so
 * the parent clears the other value whenever the mode changes.
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
  disabled,
}: Props) {
  return (
    <div className="space-y-2">
      <Label>Choose reference type</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
      ) : <p className="text-xs text-muted-foreground">Select Sales Order or Legacy TR Number to continue.</p>}
    </div>
  );
}
