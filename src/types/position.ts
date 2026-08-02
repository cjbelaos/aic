export interface Position {
  positionId: number;
  positionTitle: string;
}

export interface CreatePositionInput {
  positionTitle: string;
}

export interface UpdatePositionInput {
  positionTitle?: string;
}
