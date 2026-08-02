import { NextResponse } from "next/server";
import {
  requireAdminSession,
  requireAuthenticatedSession,
} from "@/lib/auth/session";
import { getDepartments, addDepartment } from "@/lib/departmentSheets";
import type { CreateDepartmentInput } from "@/types/department";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const departments = await getDepartments();
    return NextResponse.json(departments, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch departments.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (session instanceof Response) return session;

  try {
    const body = await request.json();
    const input: CreateDepartmentInput = {
      departmentName: String(body.departmentName || "").trim(),
    };
    const dept = await addDepartment(input);
    return NextResponse.json(dept, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create department.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
