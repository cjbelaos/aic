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
