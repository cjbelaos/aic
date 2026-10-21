import type { ServiceFeeFrequency } from "../types/contract";

export function serviceFrequencyForItems(
  items: readonly { frequency: string }[],
  selected: ServiceFeeFrequency = "Monthly",
): ServiceFeeFrequency {
  return items.length > 0 && items.every(item => item.frequency === "Quarterly")
    ? "Quarterly" : selected;
}
