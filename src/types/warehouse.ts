export interface Warehouse {
  id: string;
  warehouseId: string;
  companyId: string;
  code: string;
  name: string;
  addressLines: string;
  cityProvincePostal: string;
  contactPersonPhone: string;
  active: boolean;
  sortOrder: number;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export type CreateWarehousePayload = Omit<Warehouse, "id" | "createdAt" | "updatedAt">;
