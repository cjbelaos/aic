export interface User {
  userId: string;
  username: string;
  fullName: string;
  email: string;
  passwordHash: string;
  salt: string;
  userRoleId: number;
  departmentId: number;
  positionId: number;
  createdAt: string;
  lastLogin: string;
  signature?: string; // Drive file ID of uploaded e-Signature
  /**
   * When false, the user does NOT need approval: their FTI/liquidation
   * submissions auto-approve. Defaults to true (requires approval).
   */
  requiresApproval: boolean;
}

export interface PublicUser {
  userId: string;
  username: string;
  fullName: string;
  email: string;
  userRoleId: number;
  departmentId: number;
  positionId: number;
  createdAt: string;
  lastLogin: string;
  signature?: string; // Drive file ID of uploaded e-Signature
  requiresApproval: boolean;
}

export interface CreateUserInput {
  username: string;
  fullName: string;
  email: string;
  password: string;
  userRoleId: number;
  departmentId: number;
  positionId: number;
  signature?: string;
  requiresApproval?: boolean;
}

export interface UpdateUserInput {
  username?: string;
  fullName?: string;
  email?: string;
  password?: string;
  userRoleId?: number;
  departmentId?: number;
  positionId?: number;
  signature?: string;
  requiresApproval?: boolean;
}

export interface SessionUser {
  userId: string;
  username: string;
  email: string;
  userRoleId: number;
  departmentId: number;
  positionId: number;
  fullName: string;
  signature?: string;
}
