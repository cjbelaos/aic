export interface Vehicle {
  vehicleId: string;
  makeAndModel: string;
  licensePlate: string;
  year?: string;
  currentMileage?: string;
  lastPmsDate?: string;
  nextPmsDate?: string;
  nextPmsMileage?: string;
  registrationExpiry?: string;
  insuranceExpiry?: string;
  status: "active" | "inactive";
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface CreateVehiclePayload {
  vehicleId?: string; // optional — auto-generated VEH-n if omitted
  makeAndModel: string;
  licensePlate: string;
  year?: string;
  currentMileage?: string;
  lastPmsDate?: string;
  nextPmsDate?: string;
  nextPmsMileage?: string;
  registrationExpiry?: string;
  insuranceExpiry?: string;
  status?: "active" | "inactive";
}

export interface UpdateVehiclePayload {
  makeAndModel?: string;
  licensePlate?: string;
  year?: string;
  currentMileage?: string;
  lastPmsDate?: string;
  nextPmsDate?: string;
  nextPmsMileage?: string;
  registrationExpiry?: string;
  insuranceExpiry?: string;
  status?: "active" | "inactive";
}