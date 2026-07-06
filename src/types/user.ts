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
}

export interface PublicUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
  lastLogin: string;
}

export interface CreateUserInput {
  username: string;
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  username?: string;
  fullName?: string;
  email?: string;
  password?: string;
  role?: UserRole;
}

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  fullName: string;
}
