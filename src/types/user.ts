export type UserRole = "admin" | "user";

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: UserRole;
  createdAt: string;
  lastLogin: string;
  signature?: string; // Drive file ID of uploaded e-Signature
}

export interface PublicUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
  lastLogin: string;
  signature?: string; // Drive file ID of uploaded e-Signature
}

export interface CreateUserInput {
  username: string;
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  signature?: string;
}

export interface UpdateUserInput {
  username?: string;
  fullName?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  signature?: string;
}

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  fullName: string;
  signature?: string;
}
