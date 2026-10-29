"use client";

import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ContractNote } from "@/types/contract";
import { formatNoteDate, noteTimezone, sortContractNotes } from "@/lib/contractNotes";
import contractService from "@/lib/services/contract.service";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function ContractNoteHistory({ notes, disabled, onEdit, onDelete }: {
  notes: ContractNote[];
  disabled?: boolean;
  onEdit?: (note: ContractNote) => void;
  onDelete?: (note: ContractNote) => void;
}) {
  return <div className="space-y-3">
    {notes.length > 0 && <p className="text-xs text-muted-foreground">Newest first · Times shown in {noteTimezone()}</p>}
    {!notes.length && <p className="text-sm text-muted-foreground">No notes yet. Add a note to start tracking follow-ups.</p>}
    {sortContractNotes(notes).map(note => <article key={note.id} className="space-y-2 rounded-lg border bg-muted/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          <p>{note.createdAt ? <>Added <time dateTime={note.createdAt}>{formatNoteDate(note.createdAt)}</time></> : "Date unavailable"}</p>
          {note.updatedAt && <p>Updated <time dateTime={note.updatedAt}>{formatNoteDate(note.updatedAt)}</time></p>}
        </div>
        {(onEdit || onDelete) && <div className="flex gap-1">
          {onEdit && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onEdit(note)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>}
          {onDelete && <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={disabled} onClick={() => onDelete(note)}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>}
        </div>}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{note.text}</p>
    </article>)}
  </div>;
}

export function ContractNotesDialog({ contractId, companyName, notes, onChange, onClose }: {
  contractId: string;
  companyName: string;
  notes: ContractNote[];
  onChange: (notes: ContractNote[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<ContractNote | null>(null);
  const [editText, setEditText] = useState("");
  const [deleting, setDeleting] = useState<ContractNote | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const text = editing ? editText : draft;

  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try { await action(); }
    catch (error) {
      const message = isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : "Could not save the note change. Please try again.";
      setError(message);
      toast.error(message);
    } finally { busy.current = false; setPending(false); }
  }

  function save() {
    if (!text.trim()) return;
    void run(async () => {
      if (editing) {
        const updated = await contractService.updateNote(contractId, editing.id, editText.trim());
        onChange(notes.map(note => note.id === updated.id ? updated : note));
        setEditing(null);
        setEditText("");
        toast.success("Note updated.");
      } else {
        const added = await contractService.addNote(contractId, draft.trim());
        onChange(sortContractNotes([...notes, added]));
        setDraft("");
        toast.success("Note added.");
      }
    });
  }

  return <>
    <Dialog open onOpenChange={open => { if (!open && !busy.current) onClose(); }}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Contract Notes</DialogTitle>
          <DialogDescription>{companyName} · {contractId}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3 rounded-lg border bg-muted/10 p-3" onSubmit={event => { event.preventDefault(); save(); }}>
          <Label htmlFor="contract-note-text">{editing ? "Edit note" : "Add a note"}</Label>
          <Textarea ref={input} id="contract-note-text" value={text} onChange={event => editing ? setEditText(event.target.value) : setDraft(event.target.value)} rows={3} maxLength={10000} disabled={pending} placeholder="Follow-up reminders, renewal discussions, or other internal notes" />
          <p className="text-xs text-muted-foreground">{editing ? "The original added date is preserved. An updated date is recorded when you save." : "The date and time are recorded automatically when you add the note."}</p>
          <div className="flex justify-end gap-2">
            {editing && <Button type="button" variant="outline" disabled={pending} onClick={() => { setEditing(null); setEditText(""); setError(""); }}>Cancel edit</Button>}
            <Button type="submit" disabled={pending || !text.trim()}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Save changes" : "Add note"}</Button>
          </div>
        </form>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <ContractNoteHistory notes={notes} disabled={pending} onEdit={note => { setEditing(note); setEditText(note.text); setError(""); input.current?.focus(); }} onDelete={setDeleting} />
        <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDeleteDialog open={!!deleting} title="Delete note" description="Delete this note permanently? This action cannot be undone." onClose={() => setDeleting(null)} onConfirm={async () => {
      if (!deleting) return;
      await run(async () => {
        await contractService.deleteNote(contractId, deleting.id);
        onChange(notes.filter(note => note.id !== deleting.id));
        if (editing?.id === deleting.id) { setEditing(null); setEditText(""); }
        setDeleting(null);
        toast.success("Note deleted.");
      });
    }} />
  </>;
}
