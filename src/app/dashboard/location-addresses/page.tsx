"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  LocationAddress,
  CreateLocationAddressPayload,
} from "@/types/locationAddress";
import locationAddressService from "@/lib/services/locationAddress.service";
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

const EMPTY_FORM: CreateLocationAddressPayload = {
  locationId: "",
  locationName: "",
  address: "",
  latitude: undefined,
  longitude: undefined,
};

const columns: ColumnDef<LocationAddress>[] = [
  {
    accessorKey: "locationName",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-semibold"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Location Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="font-medium uppercase">{row.original.locationName}</span>
    ),
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
    cell: ({ row }) => (
      <span className="uppercase">{row.original.address || "—"}</span>
    ),
  },
  {
    accessorKey: "latitude",
    header: "Latitude",
    cell: ({ row }) => (
      <span className="font-mono">
        {row.original.latitude !== undefined
          ? row.original.latitude.toFixed(5)
          : "—"}
      </span>
    ),
  },
  {
    accessorKey: "longitude",
    header: "Longitude",
    cell: ({ row }) => (
      <span className="font-mono">
        {row.original.longitude !== undefined
          ? row.original.longitude.toFixed(5)
          : "—"}
      </span>
    ),
  },
];

export default function LocationAddressesPage() {
  const [data, setData] = useState<LocationAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LocationAddress | null>(null);
  const [form, setForm] = useState<CreateLocationAddressPayload>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<LocationAddress | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadLocations = useCallback(async () => {
    try {
      const locations = await locationAddressService.getAll();
      setData(locations);
    } catch {
      toast.error("Failed to load location addresses.");
    }
  }, []);

  useEffect(() => {
    loadLocations().finally(() => setLoading(false));
  }, [loadLocations]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setPosition(null);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: LocationAddress) => {
    setEditTarget(row);
    setForm({
      locationId: row.locationId,
      locationName: row.locationName,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
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
        setForm((f) => ({
          ...f,
          address: data.result.displayName.toUpperCase(),
        }));
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
        setForm((f) => ({
          ...f,
          address: data.result.displayName.toUpperCase(),
        }));
    } catch {
      // silently ignore reverse-geocode failures; lat/lng are still captured
    }
  };

  const handleSave = async () => {
    if (!form.locationName.trim()) {
      setError("Location name is required.");
      return;
    }
    if (!form.address.trim()) {
      setError("Address is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload: CreateLocationAddressPayload = {
        ...form,
        locationName: form.locationName.trim().toUpperCase(),
        address: form.address.trim().toUpperCase(),
        latitude: position ? position[0] : undefined,
        longitude: position ? position[1] : undefined,
      };

      if (editTarget) {
        await locationAddressService.update({ ...payload, id: editTarget.id });
        await loadLocations();
        toast.success("Location updated successfully.");
      } else {
        await locationAddressService.create(payload);
        await loadLocations();
        toast.success("Location created successfully.");
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
      await locationAddressService.delete(deleteTarget.id);
      await loadLocations();
      toast.success(`"${deleteTarget.locationName}" deleted successfully.`);
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete location.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const filteredData = useMemo(() => data, [data]);
  const showMap = mounted && modalOpen && typeof window !== "undefined";

  return (
    <>
      <EntityTable
        title="Location Addresses"
        columns={columns}
        data={filteredData}
        loading={loading}
        onCreateNew={openCreate}
        onEdit={openEdit}
        onDelete={(row) => setDeleteTarget(row)}
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
              {editTarget ? "Edit Location Address" : "Create Location Address"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="loc-id">Location ID</Label>
              <Input
                id="loc-id"
                value={form.locationId}
                disabled={saving}
                placeholder="Auto-generated if left blank (e.g., LOC-4)"
                onChange={(e) =>
                  setForm((f) => ({ ...f, locationId: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-name">Location Name *</Label>
              <Input
                id="loc-name"
                value={form.locationName}
                disabled={saving}
                placeholder="e.g., SM CITY BALIWAG"
                className="uppercase"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    locationName: e.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-address">Address *</Label>
              <div className="flex gap-2">
                <Input
                  id="loc-address"
                  value={form.address}
                  disabled={saving}
                  placeholder="e.g., DOÑA REMEDIOS TRINIDAD HWY, BALIWAG, BULACAN"
                  className="flex-1 uppercase"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      address: e.target.value.toUpperCase(),
                    }))
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
                {showMap ? (
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="loc-lat">Latitude</Label>
                <Input
                  id="loc-lat"
                  type="number"
                  step="any"
                  value={form.latitude ?? ""}
                  disabled={saving}
                  placeholder="e.g., 14.9547"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      latitude: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-lng">Longitude</Label>
                <Input
                  id="loc-lng"
                  type="number"
                  step="any"
                  value={form.longitude ?? ""}
                  disabled={saving}
                  placeholder="e.g., 120.8976"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      longitude: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    }))
                  }
                />
              </div>
            </div>
          </div>
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
        description={`Delete location "${deleteTarget?.locationName}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}