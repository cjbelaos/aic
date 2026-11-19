"use client";

import { Textarea } from "@/components/ui/textarea";
import { parseSerialInput, serialShortfall } from "@/lib/deliverySerials";

/** Serial number entry for one DR line, with a non-blocking "Serial missing" hint. */
export function DeliverySerialInput({
  index,
  value,
  quantity,
  requiresSerial,
  disabled,
  onChange,
}: {
  index: number;
  value: string;
  quantity: number;
  requiresSerial: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const count = parseSerialInput(value).length;
  const shortfall = serialShortfall({ requiresSerial, quantity, serialCount: count });
  return (
    <div className="dr-serial-row space-y-1 pl-0 md:pl-1">
      <label className="block">
        <span className="block text-xs text-muted-foreground">Serial no(s).</span>
        <Textarea
          aria-label={`Serial numbers for item ${index + 1}`}
          className="min-h-9 py-1.5 text-sm"
          rows={1}
          value={value}
          disabled={disabled}
          placeholder="Comma or one per line"
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {shortfall && <p className="text-xs text-amber-600 dark:text-amber-400">{shortfall.label}</p>}
      {count > quantity && <p className="text-xs text-muted-foreground">More serials than quantity</p>}
    </div>
  );
}
