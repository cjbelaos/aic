"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import type { Company, CompanyType } from "@/types/company";
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

const COMPANY_TYPES: CompanyType[] = ["Supplier", "Customer", "Both"];

type PickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (company: Company) => void;
};

/**
 * Quick-add dialog for creating a company/client from the FTI location
 * dropdown. Only Company Type, Name, and Address are collected — TIN is left
 * blank and Status is automatically "active".
 */
export function CompanyPickerDialog({
  open,
  onOpenChange,
  onSaved,
}: PickerProps) {
  const [companyType, setCompanyType] = useState<CompanyType>("Customer");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const reset = () => {
    setCompanyType("Customer");
    setCompanyName("");
    setAddress("");
    setPosition(null);
    setError("");
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const findOnMap = async () => {
    if (!address.trim()) {
      toast.error("Please enter an address to search for.");
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "forward", query: address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Geocoding failed.");
      if (!data.result) {
        toast.error("No result found for that address.");
        return;
      }
      setPosition([data.result.latitude, data.result.longitude]);
      if (data.result.displayName)
        setAddress(data.result.displayName.toUpperCase());
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
        setAddress(data.result.displayName.toUpperCase());
    } catch {
      // silently ignore reverse-geocode failures; lat/lng are still captured
    }
  };

  const handleSave = async () => {
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    if (!address.trim()) {
      setError("Address is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const company = await companyService.create({
        companyId: "",
        companyType,
        companyName: companyName.trim().toUpperCase(),
        tin: "",
        address: address.trim().toUpperCase(),
        latitude: position ? position[0] : undefined,
        longitude: position ? position[1] : undefined,
        status: "active",
      });
      if (!company) throw new Error("Failed to create company.");
      toast.success(`Company "${company.companyName}" saved.`);
      onSaved(company);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create company.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Add Company</DialogTitle>
          <DialogDescription>
            Add a client/company to the list. TIN is left blank and status is
            automatically set to Active.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="cmp-type">Company Type *</Label>
            <Select
              value={companyType}
              disabled={saving}
              onValueChange={(v) => setCompanyType(v as CompanyType)}
            >
              <SelectTrigger id="cmp-type" className="w-full">
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
          <div className="space-y-1.5">
            <Label htmlFor="cmp-name">Company Name *</Label>
            <Input
              id="cmp-name"
              value={companyName}
              disabled={saving}
              placeholder="e.g., ACE BALIWAG"
              className="uppercase"
              onChange={(e) => setCompanyName(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cmp-address">Address *</Label>
            <div className="flex gap-2">
              <Input
                id="cmp-address"
                value={address}
                disabled={saving}
                placeholder="e.g., BALIWAG, BULACAN"
                className="flex-1 uppercase"
                onChange={(e) => setAddress(e.target.value.toUpperCase())}
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
              {mounted && open && typeof window !== "undefined" ? (
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
                Coordinates: {position[0].toFixed(5)}, {position[1].toFixed(5)}
              </p>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            TIN: blank · Status: Active
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Save Company
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}