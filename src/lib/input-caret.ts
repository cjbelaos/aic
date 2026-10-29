import type { ChangeEvent, ChangeEventHandler } from "react";

/** Preserve selection when a controlled field changes only letter case. */
export function handleTextChange<T extends HTMLInputElement | HTMLTextAreaElement>(
  event: ChangeEvent<T>, onChange: ChangeEventHandler<T>,
): void {
  const input = event.currentTarget;
  const { value, selectionStart, selectionEnd, selectionDirection } = input;
  const composing = (event.nativeEvent as InputEvent).isComposing;
  onChange(event);
  if (composing || selectionStart == null || selectionEnd == null) return;

  // React commits controlled values after the handler; native value assignments reset selection.
  queueMicrotask(() => {
    if (input.ownerDocument.activeElement !== input || input.value === value) return;
    const transform = input.value === value.toUpperCase() ? (text: string) => text.toUpperCase()
      : input.value === value.toLowerCase() ? (text: string) => text.toLowerCase() : undefined;
    if (!transform) return;
    input.setSelectionRange(
      transform(value.slice(0, selectionStart)).length,
      transform(value.slice(0, selectionEnd)).length,
      selectionDirection || "none",
    );
  });
}
