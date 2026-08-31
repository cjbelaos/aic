"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Loader2, MapPin, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EntityTable } from "@/components/ui/entity-table";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import companyService from "@/lib/services/company.service";
import { Company, CompanyType, CreateCompanyPayload, CreateCompanyWithContactsPayload } from "@/types/company";
import { CreateCompanyContactPayload } from "@/types/companyContact";
import { CompanyContactsDrawer } from "@/components/company-contacts-drawer";
import { Switch } from "@/components/ui/switch";
import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";

// Custom marker icon (avoids bundler issues with Leaflet's default PNG paths)
const pinIcon = L.divIcon({
  className: "",
  html: `<div style="width:26px;height:26px;background:#ef4444;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

function MapClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapCenterer({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, Math.max(map.getZoom(), 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position[0], position[1]]);
  return null;
}

let openContactsFor: (c: Company) => void = () => {};

function exportToExcel(rows: Company[]) {
  if (rows.length === 0) {
    toast.error("No company records found to export.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Companies");

  worksheet.columns = [
    { header: "Company Type", key: "companyType", width: 15 },
    { header: "Company Name", key: "companyName", width: 25 },
    { header: "TIN", key: "tin", width: 18 },
    { header: "Address", key: "address", width: 35 },
    { header: "Status", key: "status", width: 12 },
  ];

  rows.forEach((r) => {
    worksheet.addRow({
      companyType: r.companyType,
      companyName: r.companyName,
      tin: r.tin,
      address: r.address,
      status: r.status === "active" ? "Active" : "Inactive",
    });
  });

  workbook.xlsx
    .writeBuffer()
    .then((buffer) => {
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "companies.xlsx";
      link.click();
      window.URL.revokeObjectURL(url);
    })
    .catch((err) => {
      console.error("Excel generation failed:", err);
      toast.error("Failed to generate Excel download file.");
    });
}

const EMPTY_FORM: CreateCompanyPayload = {
  companyId: "",
  companyType: "Supplier",
  companyName: "",
  tin: "",
  address: "",
  latitude: undefined,
  longitude: undefined,
  status: "active",
};

const COMPANY_TYPES: CompanyType[] = ["Supplier", "Customer", "Both"];

const EMPTY_CONTACT: CreateCompanyContactPayload = {
  contactId: "",
  companyId: "",
  fullName: "",
  email: "",
  phone: "",
  isPrimary: false,
};

type TypeFilter = "all" | "supplier" | "customer" | "both";

const columns: ColumnDef<Company>[] = [
  {
    accessorKey: "companyType",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Company Type <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <Badge
        variant={row.original.companyType === "Both" ? "default" : "secondary"}
      >
        {row.original.companyType}
      </Badge>
    ),
  },
  {
    accessorKey: "companyName",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Company Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-blue-600 font-medium">
        {row.original.companyName}
      </span>
    ),
  },
  {
    accessorKey: "tin",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        TIN <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => <span>{row.original.tin || "—"}</span>,
  },
  {
    accessorKey: "address",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Address <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => <span>{row.original.address || "—"}</span>,
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Status <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <Badge
        variant={row.original.status === "active" ? "default" : "secondary"}
      >
        {row.original.status === "active" ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  {
    id: "contacts",
    header: "Contacts",
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 h-8 text-blue-600 hover:text-blue-700"
        onClick={() => openContactsFor?.(row.original)}
      >
        <Users className="h-4 w-4" />
        View
      </Button>
    ),
  },
];

function CompaniesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");

  const [data, setData] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Company | null>(null);
  const [form, setForm] = useState<CreateCompanyPayload>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<CreateCompanyContactPayload[]>([]);
  const [contactsCompany, setContactsCompany] = useState<Company | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  // Sync the filter whenever the URL search params change. Client-side
  // navigation (e.g. clicking the sidebar Suppliers/Customers shortcuts
  // while already on this page) only changes the query string, so this
  // effect — rather than a mount-only read — keeps the view in sync.
  useEffect(() => {
    if (
      typeParam === "supplier" ||
      typeParam === "customer" ||
      typeParam === "both"
    ) {
      setTypeFilter(typeParam);
    } else {
      setTypeFilter("all");
    }
  }, [typeParam]);

  const handleTypeFilterChange = (v: TypeFilter) => {
    setTypeFilter(v);
    const params = new URLSearchParams(searchParams.toString());
    if (v === "all") {
      params.delete("type");
    } else {
      params.set("type", v);
    }
    const qs = params.toString();
    router.replace(qs ? `/dashboard/companies?${qs}` : "/dashboard/companies");
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    openContactsFor = (c) => setContactsCompany(c);
  }, []);

  const filteredData = useMemo(() => {
    if (typeFilter === "all") return data;
    if (typeFilter === "both") {
      return data.filter((c) => c.companyType === "Both");
    }
    if (typeFilter === "supplier") {
      return data.filter(
        (c) => c.companyType === "Supplier" || c.companyType === "Both",
      );
    }
    return data.filter(
      (c) => c.companyType === "Customer" || c.companyType === "Both",
    );
  }, [data, typeFilter]);

  const loadCompanies = async () => {
    try {
      const companies = await companyService.getAll();
      setData(companies);
    } catch {
      toast.error("Failed to load companies.");
    }
  };

  useEffect(() => {
    loadCompanies().finally(() => setLoading(false));
  }, []);

  // When the page was opened via the Customers/Suppliers shortcut, the type
  // is implied by the URL and must not be changed on create; otherwise it is
  // user-selectable.
  const lockedType: CompanyType | null =
    typeParam === "customer"
      ? "Customer"
      : typeParam === "supplier"
        ? "Supplier"
        : null;

  const openCreate = () => {
    setEditTarget(null);
    setForm({
      ...EMPTY_FORM,
      companyType: lockedType ?? EMPTY_FORM.companyType,
    });
    setContacts([]);
    setPosition(null);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: Company) => {
    setEditTarget(row);
    setForm({
      companyId: row.companyId, // kept in state for import only, not shown in form
      companyType: row.companyType,
      companyName: row.companyName,
      tin: row.tin,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.status,
    });
    setPosition(
      row.latitude !== undefined && row.longitude !== undefined
        ? [row.latitude, row.longitude]
        : null,
    );
    setError("");
    setModalOpen(true);
  };

  const findOnMap = async () => {
    if (!form.address.trim()) {
      toast.error("Please enter an address to search for.");
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "forward", query: form.address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Geocoding failed.");
      if (!data.result) {
        toast.error("No result found for that address.");
        return;
      }
      setPosition([data.result.latitude, data.result.longitude]);
      if (data.result.displayName)
        setForm((f) => ({ ...f, address: data.result.displayName }));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to geocode address.",
      );
    } finally {
      setGeocoding(false);
    }
  };

  const handlePinDrag = async (lat: number, lng: number) => {
    setPosition([lat, lng]);
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "reverse", lat, lng }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reverse geocoding failed.");
      if (data.result?.displayName)
        setForm((f) => ({ ...f, address: data.result.displayName }));
    } catch {
      // silently ignore reverse-geocode failures; lat/lng are still captured
    }
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) {
      setError("Company name is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        ...form,
        latitude: position ? position[0] : undefined,
        longitude: position ? position[1] : undefined,
      };

      if (editTarget) {
        await companyService.update({
          ...payload,
          id: editTarget.id,
        });
        await loadCompanies();
        toast.success("Company updated successfully.");
      } else {
        const contactsPayload = contacts.filter((c) => c.fullName.trim());
        await companyService.create({
          ...payload,
          contacts: contactsPayload.length > 0 ? contactsPayload : undefined,
        } as CreateCompanyWithContactsPayload);
        await loadCompanies();
        toast.success("Company created successfully.");
      }
      setModalOpen(false);
    } catch (err) {
      console.error("Save error:", err);
      setError("Server error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await companyService.delete(deleteTarget.id);
      await loadCompanies();
      toast.success(`"${deleteTarget.companyName}" deleted successfully.`);
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete company.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleImport = async (file: File) => {
    let toastId: string | number | undefined;

    try {
      const dataBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(dataBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        toast.error("The selected workbook contains no worksheets.");
        return;
      }

      const companiesToImport: CreateCompanyPayload[] = [];
      const headers: string[] = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell((cell) => {
            headers.push(String(cell.value || "").trim());
          });
          return;
        }

        const rowData: Record<string, any> = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const headerName = headers[colNumber - 1];
          if (headerName) {
            const cellValue =
              cell.value &&
              typeof cell.value === "object" &&
              "result" in cell.value
                ? cell.value.result
                : cell.value;
            rowData[headerName] = cellValue;
          }
        });

        const companyName = String(
          rowData["Company Name"] ||
            rowData["Supplier Name"] ||
            rowData["Customer Name"] ||
            "",
        ).trim();
        if (!companyName) return;

        const rawType = String(rowData["Company Type"] || "Supplier")
          .trim()
          .toLowerCase();
        const companyType: CompanyType =
          rawType === "customer"
            ? "Customer"
            : rawType === "both"
              ? "Both"
              : "Supplier";

        const rawStatus = String(rowData["Status"] || "")
          .toLowerCase()
          .trim();
        const status = rawStatus === "inactive" ? "inactive" : "active";

        const rawLat = parseFloat(String(rowData["Latitude"] || ""));
        const rawLng = parseFloat(String(rowData["Longitude"] || ""));

        companiesToImport.push({
          companyId: String(rowData["Company ID"] || "").trim(),
          companyType,
          companyName,
          tin: String(rowData["TIN"] || "").trim(),
          address: String(
            rowData["Address"] || rowData["AddressLine"] || "",
          ).trim(),
          latitude: isNaN(rawLat) ? undefined : rawLat,
          longitude: isNaN(rawLng) ? undefined : rawLng,
          status,
        });
      });

      if (companiesToImport.length === 0) {
        toast.error(
          "No valid company profiles found inside the selected workbook.",
        );
        return;
      }

      toastId = toast.loading(
        "Clearing existing records and preparing import...",
      );

      try {
        await companyService.getAll();
      } catch (clearErr) {
        console.error("Failed to verify company records:", clearErr);
        toast.error("Failed to reset existing company list. Import aborted.", {
          id: toastId,
        });
        return;
      }

      toast.loading(`Importing ${companiesToImport.length} fresh records...`, {
        id: toastId,
      });

      let successCount = 0;
      let failCount = 0;

      for (const company of companiesToImport) {
        try {
          const res = await companyService.create(company);
          if (res) successCount++;
          else failCount++;
        } catch {
          failCount++;
        }
      }

      await loadCompanies();

      if (failCount === 0) {
        toast.success(`Successfully imported ${successCount} companies.`, {
          id: toastId,
        });
      } else {
        toast.warning(
          `Imported ${successCount} companies. ${failCount} failed.`,
          { id: toastId },
        );
      }
    } catch (err) {
      console.error("Import error:", err);
      toast.error("Failed to complete workbook import parsing layout.", {
        id: toastId,
      });
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Label htmlFor="co-filter" className="text-sm whitespace-nowrap">
          Company Type:
        </Label>
        <Select
          value={typeFilter}
          onValueChange={(v) => handleTypeFilterChange(v as TypeFilter)}
        >
          <SelectTrigger id="co-filter" className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="supplier">Suppliers</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="both">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <EntityTable
        title="Companies"
        columns={columns}
        data={filteredData}
        loading={loading}
        onCreateNew={openCreate}
        onEdit={openEdit}
        onDelete={(row) => setDeleteTarget(row)}
        onExport={() => exportToExcel(data)}
        onImport={handleImport}
      />

      <Dialog
        open={modalOpen}
        onOpenChange={(v) => {
          if (!saving) setModalOpen(v);
        }}
      >
        <DialogContent className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto"
            onInteractOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Company" : "Create Company"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!lockedType && (
              <div className="space-y-1.5">
                <Label htmlFor="co-type">Company Type</Label>
                <Select
                  value={form.companyType}
                  disabled={saving}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, companyType: v as CompanyType }))
                  }
                >
                  <SelectTrigger id="co-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="co-name">Company Name *</Label>
              <Input
                id="co-name"
                value={form.companyName}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, companyName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-tin">TIN</Label>
              <Input
                id="co-tin"
                value={form.tin}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tin: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-address">Address</Label>
              <div className="flex gap-2">
                <Input
                  id="co-address"
                  value={form.address}
                  disabled={saving}
                  className="flex-1"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={findOnMap}
                  disabled={geocoding || saving}
                >
                  {geocoding ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-1 h-4 w-4" />
                  )}
                  Find on Map
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Map (drag the pin to set coordinates)</Label>
              <div className="h-64 w-full overflow-hidden rounded-md border">
                {mounted && modalOpen && typeof window !== "undefined" ? (
                  <MapContainer
                    center={position || [14.6091, 120.9922]}
                    zoom={position ? 15 : 12}
                    className="h-full w-full"
                    scrollWheelZoom={false}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {position && (
                      <Marker
                        position={position}
                        icon={pinIcon}
                        draggable
                        eventHandlers={{
                          dragend: (e) => {
                            const m = e.target as L.Marker;
                            const ll = m.getLatLng();
                            handlePinDrag(ll.lat, ll.lng);
                          },
                        }}
                      />
                    )}
                    <MapClickHandler
                      onPick={(lat, lng) => handlePinDrag(lat, lng)}
                    />
                    {position && <MapCenterer position={position} />}
                  </MapContainer>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                    <MapPin className="mr-2 h-4 w-4" /> Map loading…
                  </div>
                )}
              </div>
              {position && (
                <p className="text-xs text-muted-foreground">
                  Coordinates: {position[0].toFixed(5)},{" "}
                  {position[1].toFixed(5)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="co-status">Status</Label>
              <Select
                value={form.status}
                disabled={saving}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as "active" | "inactive" }))
                }
              >
                <SelectTrigger id="co-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Contacts section (create only) ──────────────────────── */}
          {!editTarget && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Contacts</Label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    setContacts((prev) => [...prev, { ...EMPTY_CONTACT }])
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Contact
                </Button>
              </div>

              {contacts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No contacts added yet. Click "Add Contact" to include one.
                </p>
              )}

              {contacts.map((c, idx) => (
                <div
                  key={idx}
                  className="space-y-2 rounded-md border p-3 relative"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-6 w-6 text-muted-foreground hover:text-destructive"
                    disabled={saving}
                    onClick={() =>
                      setContacts((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1 col-span-2 sm:col-span-1">
                      <Label htmlFor={`co-contact-name-${idx}`}>
                        Full Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`co-contact-name-${idx}`}
                        value={c.fullName}
                        disabled={saving}
                        onChange={(e) => {
                          const updated = [...contacts];
                          updated[idx] = { ...updated[idx], fullName: e.target.value };
                          setContacts(updated);
                        }}
                        placeholder="Contact name"
                      />
                    </div>
                    <div className="space-y-1 col-span-2 sm:col-span-1">
                      <Label htmlFor={`co-contact-email-${idx}`}>Email</Label>
                      <Input
                        id={`co-contact-email-${idx}`}
                        type="email"
                        value={c.email}
                        disabled={saving}
                        onChange={(e) => {
                          const updated = [...contacts];
                          updated[idx] = { ...updated[idx], email: e.target.value };
                          setContacts(updated);
                        }}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="space-y-1 col-span-2 sm:col-span-1">
                      <Label htmlFor={`co-contact-phone-${idx}`}>Phone</Label>
                      <Input
                        id={`co-contact-phone-${idx}`}
                        value={c.phone}
                        disabled={saving}
                        onChange={(e) => {
                          const updated = [...contacts];
                          updated[idx] = { ...updated[idx], phone: e.target.value };
                          setContacts(updated);
                        }}
                        placeholder="+63 9XX XXX XXXX"
                      />
                    </div>
                    <div className="flex items-end pb-1.5 col-span-2 sm:col-span-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`co-contact-primary-${idx}`}
                          checked={c.isPrimary}
                          disabled={saving}
                          onCheckedChange={(v) => {
                            const updated = [...contacts];
                            updated[idx] = { ...updated[idx], isPrimary: v };
                            setContacts(updated);
                          }}
                        />
                        <Label htmlFor={`co-contact-primary-${idx}`}>
                          Primary Contact
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTarget ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        description={`Delete company "${deleteTarget?.companyName}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <CompanyContactsDrawer
        company={contactsCompany}
        open={!!contactsCompany}
        onOpenChange={(v) => {
          if (!v) setContactsCompany(null);
        }}
      />
    </>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={null}>
      <CompaniesPageInner />
    </Suspense>
  );
}
