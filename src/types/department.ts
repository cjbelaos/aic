export interface Department {
  departmentId: number;
  departmentName: string;
}

export interface CreateDepartmentInput {
  departmentName: string;
}

export interface UpdateDepartmentInput {
  departmentName?: string;
}
