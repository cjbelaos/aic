"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import companyContactService from "@/lib/services/companyContact.service";
import {
  CompanyContact,
  CreateCompanyContactPayload,
} from "@/types/companyContact";
import { Company } from "@/types/company";

const EMPTY_FORM: CreateCompanyContactPayload = {
  contactId: "",
  companyId: "",
  fullName: "",
  email: "",
  phone: "",
  isPrimary: false,
};

interface Props {
  company: Company | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}

export function CompanyContactsDrawer({
  company,
  open,
  onOpenChange,
  onChanged,
}: Props) {
  const [contacts, setContacts] = useState<CompanyContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateCompanyContactPayload>(EMPTY_FORM);
  const [editTarget, setEditTarget] = useState<CompanyContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyContact | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadContacts = async (companyId: string) => {
    setLoading(true);
    try {
      const all = await companyContactService.getAll();
      setContacts(
        all.filter(
          (c) =>
            c.companyId === companyId || c.companyId === (company?.id ?? ""),
        ),
      );
    } catch {
      toast.error("Failed to load company contacts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && company) {
      loadContacts(company.companyId);
      setShowForm(false);
      setEditTarget(null);
      setForm({
        ...EMPTY_FORM,
        companyId: company.companyId,
      });
      setDeleteTarget(null);
    }
  }, [open, company]);

  const openCreate = () => {
    if (!company) return;
    setEditTarget(null);
    setForm({
      ...EMPTY_FORM,
      companyId: company.companyId,
    });
    setShowForm(true);
  };

  const openEdit = (contact: CompanyContact) => {
    setEditTarget(contact);
    setForm({
      contactId: contact.contactId,
      companyId: contact.companyId,
      fullName: contact.fullName,
      email: contact.email,
      phone: contact.phone,
      isPrimary: contact.isPrimary,
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.fullName.trim()) {
      toast.error("Contact name is required.");
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await companyContactService.update({ ...form, id: editTarget.id });
        toast.success("Contact updated successfully.");
      } else {
        await companyContactService.create(form);
        toast.success("Contact created successfully.");
      }
      if (company) loadContacts(company.companyId);
      cancelForm();
      onChanged?.();
    } catch {
      toast.error("Failed to save contact. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await companyContactService.delete(deleteTarget.id);
      if (company) loadContacts(company.companyId);
      toast.success("Contact deleted successfully.");
      onChanged?.();
    } catch {
      toast.error("Failed to delete contact.");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="w-full sm:max-w-md overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>Company Contacts</DrawerTitle>
          <DrawerDescription>
            {company ? company.companyName : "Select a company"} — manage
            contact persons for this company.
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 px-4 pb-6">
          {!showForm && (
            <Button
              onClick={openCreate}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!company || loading}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Contact
            </Button>
          )}

          {showForm && (
            <div className="rounded-md border p-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Full Name *</Label>
                <Input
                  id="c-name"
                  value={form.fullName}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input
                  id="c-email"
                  type="email"
                  value={form.email}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">Phone</Label>
                <Input
                  id="c-phone"
                  value={form.phone}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="c-primary"
                  checked={form.isPrimary}
                  disabled={saving}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, isPrimary: v }))
                  }
                />
                <Label htmlFor="c-primary">Primary Contact</Label>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={cancelForm}
                  disabled={saving}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editTarget ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading contacts…
            </div>
          ) : contacts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No contacts found for this company.
            </div>
          ) : (
            <div className="space-y-2">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {c.fullName}
                      </p>
                      {c.isPrimary && <Badge>Primary</Badge>}
                    </div>
                    <div className="flex flex-col gap-0.5 mt-1 text-xs text-muted-foreground">
                      {c.email && (
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3" /> {c.email}
                        </span>
                      )}
                      {c.phone && (
                        <span className="flex items-center gap-1 truncate">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(c)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <ConfirmDeleteDialog
          open={!!deleteTarget}
          description={`Delete contact "${deleteTarget?.fullName}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      </DrawerContent>
    </Drawer>
  );
}
