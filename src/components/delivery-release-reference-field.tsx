"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DELIVERY_REFERENCE_FIELD_LABEL,
  DELIVERY_REFERENCE_MODE_CHOICES,
  TR_NUMBER_FIELD_LABEL,
  type DeliveryReferenceMode,
} from "@/lib/deliveryReference";

interface Props {
  mode: DeliveryReferenceMode;
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
      <Label>{DELIVERY_REFERENCE_FIELD_LABEL}</Label>
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
      ) : (
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
      )}
    </div>
  );
}
