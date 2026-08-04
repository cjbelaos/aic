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
import supplierContactService from "@/lib/services/supplierContact.service";
import {
  SupplierContact,
  CreateSupplierContactPayload,
} from "@/types/supplierContact";
import { Supplier } from "@/types/supplier";

const EMPTY_FORM: CreateSupplierContactPayload = {
  contactId: "",
  supplierId: "",
  fullName: "",
  email: "",
  phone: "",
  isPrimary: false,
};

interface Props {
  supplier: Supplier | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}

export function SupplierContactsDrawer({
  supplier,
  open,
  onOpenChange,
  onChanged,
}: Props) {
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateSupplierContactPayload>(EMPTY_FORM);
  const [editTarget, setEditTarget] = useState<SupplierContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupplierContact | null>(
    null,
  );
  const [showForm, setShowForm] = useState(false);

  const loadContacts = async (supplierId: string) => {
    setLoading(true);
    try {
      const all = await supplierContactService.getAll();
      setContacts(
        all.filter(
          (c) =>
            c.supplierId === supplierId ||
            c.supplierId === (supplier?.id ?? "") ||
            c.supplierId === (supplier?.supplierId ?? ""),
        ),
      );
    } catch {
      toast.error("Failed to load supplier contacts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && supplier) {
      loadContacts(supplier.supplierId || supplier.id);
      setShowForm(false);
      setEditTarget(null);
      setForm({
        ...EMPTY_FORM,
        supplierId: supplier.supplierId || supplier.id,
      });
      setDeleteTarget(null);
    }
  }, [open, supplier]);

  const openCreate = () => {
    if (!supplier) return;
    setEditTarget(null);
    setForm({
      ...EMPTY_FORM,
      supplierId: supplier.supplierId || supplier.id,
    });
    setShowForm(true);
  };

  const openEdit = (contact: SupplierContact) => {
    setEditTarget(contact);
    setForm({
      contactId: contact.contactId,
      supplierId: contact.supplierId,
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
        await supplierContactService.update({ ...form, id: editTarget.id });
        toast.success("Contact updated successfully.");
      } else {
        await supplierContactService.create(form);
        toast.success("Contact created successfully.");
      }
      if (supplier) loadContacts(supplier.supplierId || supplier.id);
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
      await supplierContactService.delete(deleteTarget.id);
      if (supplier) loadContacts(supplier.supplierId || supplier.id);
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
          <DrawerTitle>Supplier Contacts</DrawerTitle>
          <DrawerDescription>
            {supplier ? supplier.supplierName : "Select a supplier"} — manage
            contact persons for this supplier.
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 px-4 pb-6">
          {!showForm && (
            <Button
              onClick={openCreate}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!supplier || loading}
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
              No contacts found for this supplier.
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
