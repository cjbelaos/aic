"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, Search, Save } from "lucide-react";
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
import { toast } from "sonner";
import type { LocationAddress } from "@/types/locationAddress";
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

type PickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (location: LocationAddress) => void;
};

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

export function LocationPickerDialog({
  open,
  onOpenChange,
  onSaved,
}: PickerProps) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const reset = () => {
    setName("");
    setAddress("");
    setPosition(null);
  };

  useEffect(() => {
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!name.trim()) {
      toast.error("Location name is required.");
      return;
    }
    if (!address.trim()) {
      toast.error("Address is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/location-addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationName: name.trim(),
          address: address.trim(),
          latitude: position ? position[0] : undefined,
          longitude: position ? position[1] : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save location.");
      toast.success(`Location "${data.locationName}" saved.`);
      onSaved(data as LocationAddress);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save location.",
      );
    } finally {
      setSaving(false);
    }
  };

  const showMap = mounted && open && typeof window !== "undefined";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Location</DialogTitle>
          <DialogDescription>
            Enter the location manually or drag the pin on the map to set its
            coordinates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loc-name">
              Location Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="loc-name"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="e.g., SM CITY BALIWAG"
              className="uppercase"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="loc-address">
              Address <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="loc-address"
                value={address}
                onChange={(e) => setAddress(e.target.value.toUpperCase())}
                placeholder="e.g., DOÑA REMEDIOS TRINIDAD HWY, BALIWAG, BULACAN"
                className="flex-1 uppercase"
              />
              <Button
                type="button"
                variant="outline"
                onClick={findOnMap}
                disabled={geocoding}
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

          <div className="space-y-2">
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
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Save Location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}