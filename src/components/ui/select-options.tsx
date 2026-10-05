import * as React from "react";

export const EMPTY_SELECT_VALUE = "__empty_select_value__";
export type SelectOption = { value: string; label: React.ReactNode; disabled?: boolean };

export function optionText(node: React.ReactNode): string {
  return React.Children.toArray(node).map(child => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (React.isValidElement<{ children?: React.ReactNode }>(child)) return optionText(child.props.children);
    return "";
  }).join(" ").trim();
}

export function findSelectChildren(children: React.ReactNode, type: React.ElementType): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(children).flatMap(child => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return [];
    if (child.type === type) return [child as React.ReactElement<Record<string, unknown>>];
    return findSelectChildren(child.props.children, type);
  });
}
