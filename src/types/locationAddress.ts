export interface LocationAddress {
  id: string;
  locationId: string;
  locationName: string;
  address: string;
  latitude: number | undefined;
  longitude: number | undefined;
}

export interface CreateLocationAddressPayload {
  locationId?: string;
  locationName: string;
  address: string;
  latitude?: number;
  longitude?: number;
}