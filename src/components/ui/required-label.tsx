import React from "react";
import { Label } from "@/components/ui/label";

interface RequiredLabelProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Label with a red asterisk indicating the field is required.
 */
export function RequiredLabel({ children, className }: RequiredLabelProps) {
  return (
    <Label className={className}>
      {children}
      <span className="text-red-500 ml-0.5">*</span>
    </Label>
  );
}
