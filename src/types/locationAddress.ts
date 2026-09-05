export type LocationStatus =
  | "ready"
  | "needs_coordinates"
  | "needs_geocoding";

export interface LocationAddress {
  id: string;
  locationId: string;
  locationName: string;
  address: string;
  latitude: number | undefined;
  longitude: number | undefined;
  /** CompanyId this location mirrors (from the Companies sheet), if any. */
  companyId?: string;
  /** Derived readiness for FTI (see deriveLocationStatus). */
  status: LocationStatus;
}

export interface CreateLocationAddressPayload {
  locationId?: string;
  locationName: string;
  address: string;
  latitude?: number;
  longitude?: number;
  /** CompanyId this location mirrors (from the Companies sheet), if any. */
  companyId?: string;
}

export const LOCATION_STATUS_META: Record<
  LocationStatus,
  { label: string; hint: string }
> = {
  ready: { label: "Ready", hint: "Usable in FTI" },
  needs_coordinates: {
    label: "Needs Coordinates",
    hint: "Address set, but coordinates are missing / invalid",
  },
  needs_geocoding: {
    label: "Not Configured",
    hint: "No address — set the address and pin for FTI",
  },
};

export function isValidLatitude(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

export function isValidLongitude(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

/**
 * True only when both coordinates are valid numerics AND not the (0,0)
 * default/placeholder pin, which would otherwise masquerade as a real location.
 */
export function isUsableLocationPair(
  latitude: unknown,
  longitude: unknown,
): boolean {
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return false;
  return !(latitude === 0 && longitude === 0);
}

/**
 * Derives a location's readiness for FTI with explicit precedence:
 *
 *   Address empty (after trim)      → needs_geocoding
 *   Address present, coords missing → needs_coordinates
 *   Address present, coords valid   → ready
 *
 * A whitespace-only address counts as empty. The (0,0) pair counts as invalid
 * coordinates (placeholder pin), so it maps to needs_coordinates, never ready.
 */
export function deriveLocationStatus(loc: {
  address?: string;
  latitude?: number;
  longitude?: number;
}): LocationStatus {
  const hasAddress = (loc.address ?? "").trim().length > 0;
  if (!hasAddress) return "needs_geocoding";
  if (!isUsableLocationPair(loc.latitude, loc.longitude)) {
    return "needs_coordinates";
  }
  return "ready";
}