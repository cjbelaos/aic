export interface Miscellaneous {
  code: string;
  description: string;
}

export interface CreateMiscellaneousInput {
  code: string;
  description: string;
}

export interface UpdateMiscellaneousInput {
  code?: string;
  description?: string;
}
