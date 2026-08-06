"use client";

import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityTable } from "@/components/ui/entity-table";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { userService } from "@/lib/services/user.service";
import { departmentService } from "@/lib/services/department.service";
import { positionService } from "@/lib/services/position.service";
import type {
  PublicUser,
  CreateUserInput,
  UpdateUserInput,
} from "@/types/user";
import type { Department } from "@/types/department";
import type { Position } from "@/types/position";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserFormState {
  username: string;
  fullName: string;
  email: string;
  password: string;
  userRoleId: number;
  departmentId: number;
  positionId: number;
}

const EMPTY_FORM: UserFormState = {
  username: "",
  fullName: "",
  email: "",
  password: "",
  userRoleId: 2,
  departmentId: 0,
  positionId: 0,
};

// Role ID → label mapping
const ROLE_LABELS: Record<number, string> = {
  1: "Admin",
  2: "User",
};

export default function UsersPage() {
  const [data, setData] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PublicUser | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<PublicUser | null>(null);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<number>(2);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);

  const isAdmin = useMemo(() => currentUserRoleId === 1, [currentUserRoleId]);

  const deptMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of departments) map.set(d.departmentId, d.departmentName);
    return map;
  }, [departments]);

  const posMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of positions) map.set(p.positionId, p.positionTitle);
    return map;
  }, [positions]);

  const columns = useMemo<ColumnDef<PublicUser>[]>(
    () => [
      {
        accessorKey: "username",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 font-semibold"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Username <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-blue-600">
            {row.original.username}
          </span>
        ),
      },
      {
        accessorKey: "fullName",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 font-semibold"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Full Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {row.original.fullName || "—"}
          </span>
        ),
      },
      { accessorKey: "email", header: "Email" },
      {
        accessorKey: "userRoleId",
        header: "Role",
        cell: ({ row }) => (
          <Badge
            variant={row.original.userRoleId === 1 ? "default" : "secondary"}
            className="capitalize"
          >
            {ROLE_LABELS[row.original.userRoleId] ?? "User"}
          </Badge>
        ),
      },
      {
        id: "department",
        header: "Department",
        cell: ({ row }) => {
          const name = deptMap.get(row.original.departmentId);
          return <span>{name || "—"}</span>;
        },
      },
      {
        id: "position",
        header: "Position",
        cell: ({ row }) => {
          const name = posMap.get(row.original.positionId);
          return <span>{name || "—"}</span>;
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created At",
        cell: ({ row }) =>
          row.original.createdAt
            ? new Date(row.original.createdAt).toLocaleString()
            : "—",
      },
      { accessorKey: "lastLogin", header: "Last Login" },
    ],
    [deptMap, posMap],
  );

  const loadUsers = async () => {
    try {
      const [users, depts, poss] = await Promise.all([
        userService.getAllUsers(),
        departmentService.getAll(),
        positionService.getAll(),
      ]);
      setData(users);
      setDepartments(depts);
      setPositions(poss);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load data.");
    }
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("auth:user");
      if (raw) {
        const parsed = JSON.parse(raw) as { userRoleId?: number };
        setCurrentUserRoleId(parsed.userRoleId ?? 2);
      }
    } catch {
      setCurrentUserRoleId(2);
    }

    loadUsers().finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: PublicUser) => {
    setEditTarget(row);
    setForm({
      username: row.username,
      fullName: row.fullName || "",
      email: row.email,
      password: "",
      userRoleId: row.userRoleId,
      departmentId: row.departmentId,
      positionId: row.positionId,
    });
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    const cleanUsername = form.username.trim();
    const cleanFullName = form.fullName.trim();

    if (!cleanUsername) {
      setError("Username is required.");
      return;
    }

    if (!cleanFullName) {
      setError("Full name is required.");
      return;
    }

    if ((!editTarget || form.password) && form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editTarget) {
        const payload: UpdateUserInput = {
          username: cleanUsername,
          fullName: cleanFullName,
          email: form.email.trim(),
          userRoleId: form.userRoleId,
          departmentId: form.departmentId,
          positionId: form.positionId,
          ...(form.password ? { password: form.password } : {}),
        };
        await userService.updateUser(editTarget.userId, payload);
        toast.success("User updated successfully.");
      } else {
        const payload: CreateUserInput = {
          username: cleanUsername,
          fullName: cleanFullName,
          email: form.email.trim(),
          password: form.password,
          userRoleId: form.userRoleId,
          departmentId: form.departmentId,
          positionId: form.positionId,
        };
        await userService.createUser(payload);
        toast.success("User created successfully.");
      }

      await loadUsers();
      setModalOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Server error. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await userService.deleteUser(deleteTarget.userId);
      toast.success(`"${deleteTarget.username}" deleted successfully.`);

      let currentLoggedUsername = "";
      try {
        const raw = window.localStorage.getItem("auth:user");
        if (raw) {
          currentLoggedUsername =
            (JSON.parse(raw) as { userName?: string }).userName || "";
        }
      } catch (_) {}

      if (
        deleteTarget.username.toLowerCase() ===
        currentLoggedUsername.toLowerCase()
      ) {
        toast.info("Your account was deleted. Logging out...");
        await userService.logout();
        window.localStorage.removeItem("auth:user");
        window.location.href = "/login";
        return;
      }

      await loadUsers();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete user.",
      );
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <EntityTable
        title="User Management"
        columns={columns}
        data={data}
        loading={loading}
        onCreateNew={isAdmin ? openCreate : undefined}
        onEdit={isAdmin ? openEdit : undefined}
        onDelete={isAdmin ? (row) => setDeleteTarget(row) : undefined}
      />

      {!isAdmin && !loading && (
        <p className="text-sm text-muted-foreground mt-4">
          You have read-only access. Contact an administrator to manage users.
        </p>
      )}

      {isAdmin && (
        <>
          <Dialog
            open={modalOpen}
            onOpenChange={(open) => !saving && setModalOpen(open)}
          >
            <DialogContent
              className="sm:max-w-md"
              onPointerDownOutside={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle>
                  {editTarget ? "Edit User" : "Add New User"}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="space-y-1.5">
                  <Label htmlFor="user-username">Username *</Label>
                  <Input
                    id="user-username"
                    value={form.username}
                    disabled={saving}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, username: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-fullname">Full Name</Label>
                  <Input
                    id="user-fullname"
                    value={form.fullName}
                    disabled={saving}
                    placeholder="e.g. John Doe"
                    onChange={(e) =>
                      setForm((c) => ({ ...c, fullName: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-email">Email</Label>
                  <Input
                    id="user-email"
                    type="email"
                    value={form.email}
                    disabled={saving}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, email: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-password">
                    Password{" "}
                    {editTarget ? "(leave blank to keep current)" : "*"}
                  </Label>
                  <Input
                    id="user-password"
                    type="password"
                    value={form.password}
                    disabled={saving}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, password: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-role">Role</Label>
                  <Select
                    value={String(form.userRoleId)}
                    disabled={saving}
                    onValueChange={(value) =>
                      setForm((c) => ({ ...c, userRoleId: Number(value) }))
                    }
                  >
                    <SelectTrigger id="user-role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Admin</SelectItem>
                      <SelectItem value="2">User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-department">Department</Label>
                  <Select
                    value={String(form.departmentId)}
                    disabled={saving}
                    onValueChange={(value) =>
                      setForm((c) => ({ ...c, departmentId: Number(value) }))
                    }
                  >
                    <SelectTrigger id="user-department" className="w-full">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">None</SelectItem>
                      {departments.map((d) => (
                        <SelectItem
                          key={d.departmentId}
                          value={String(d.departmentId)}
                        >
                          {d.departmentName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-position">Position</Label>
                  <Select
                    value={String(form.positionId)}
                    disabled={saving}
                    onValueChange={(value) =>
                      setForm((c) => ({ ...c, positionId: Number(value) }))
                    }
                  >
                    <SelectTrigger id="user-position" className="w-full">
                      <SelectValue placeholder="Select position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">None</SelectItem>
                      {positions.map((p) => (
                        <SelectItem
                          key={p.positionId}
                          value={String(p.positionId)}
                        >
                          {p.positionTitle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editTarget ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ConfirmDeleteDialog
            open={!!deleteTarget}
            description={`Delete user "${deleteTarget?.username}"? This cannot be undone.`}
            onConfirm={handleDelete}
            onClose={() => setDeleteTarget(null)}
          />
        </>
      )}
    </>
  );
}
