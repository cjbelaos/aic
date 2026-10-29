import type { ContractNote } from "@/types/contract";

export function sortContractNotes(notes: ContractNote[]): ContractNote[] {
  return [...notes].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id));
}

export function formatNoteDate(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function noteTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function exportContractNotes(notes: ContractNote[]): string {
  return sortContractNotes(notes).map(note => `${note.createdAt ? `Added ${formatNoteDate(note.createdAt)} (${noteTimezone()})` : "Date unavailable"}${note.updatedAt ? `; Updated ${formatNoteDate(note.updatedAt)} (${noteTimezone()})` : ""}: ${note.text}`).join("\n\n");
}
