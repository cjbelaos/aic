"use client";

import { Button } from "./button";
import { SearchableSelect } from "./searchable-select";

type Option = { value: string; label: string };

type LocationSearchableSelectProps = {
  value?: string;
  onValueChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  onAddLocation?: () => void;
  addLocationLabel?: string;
  onAddCompany?: () => void;
  addCompanyLabel?: string;
};

export function LocationSearchableSelect({ onAddLocation, addLocationLabel = "+ Add Location", onAddCompany, addCompanyLabel = "+ Add Company", ...props }: LocationSearchableSelectProps) {
  return <div className="min-w-0">
    <SearchableSelect {...props} />
    {(onAddLocation || onAddCompany) && <div className="flex flex-wrap gap-1">
      {onAddCompany && <Button type="button" variant="ghost" size="sm" onClick={onAddCompany}>{addCompanyLabel}</Button>}
      {onAddLocation && <Button type="button" variant="ghost" size="sm" onClick={onAddLocation}>{addLocationLabel}</Button>}
    </div>}
  </div>;
}
