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
import type {
  PublicUser,
  UserRole,
  CreateUserInput,
  UpdateUserInput,
} from "@/types/user";
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
  role: UserRole;
}

const EMPTY_FORM: UserFormState = {
  username: "",
  fullName: "",
  email: "",
  password: "",
  role: "user",
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
  const [currentRole, setCurrentRole] = useState<string>("");

  const isAdmin = useMemo(
    () => currentRole.trim().toLowerCase() === "admin",
    [currentRole],
  );

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
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <Badge
            variant={row.original.role === "admin" ? "default" : "secondary"}
            className="capitalize"
          >
            {row.original.role}
          </Badge>
        ),
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
    [],
  );

  const loadUsers = async () => {
    try {
      const users = await userService.getAllUsers();
      setData(users);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load users.");
    }
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("auth:user");
      if (raw) {
        const parsed = JSON.parse(raw) as { role?: string };
        setCurrentRole(parsed.role || "");
      }
    } catch {
      setCurrentRole("");
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
      role: row.role,
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
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
        };
        await userService.updateUser(editTarget.id, payload);
        toast.success("User updated successfully.");
      } else {
        const payload: CreateUserInput = {
          username: cleanUsername,
          fullName: cleanFullName,
          email: form.email.trim(),
          password: form.password,
          role: form.role,
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
      await userService.deleteUser(deleteTarget.id);
      toast.success(`"${deleteTarget.username}" deleted successfully.`);

      let currentLoggedUsername = "";
      try {
        const raw = window.localStorage.getItem("auth:user");
        console.log("Current logged user raw data:", raw);
        if (raw) {
          currentLoggedUsername =
            (JSON.parse(raw) as { username?: string }).username || "";
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
            <DialogContent className="sm:max-w-md">
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
                    placeholder="e.g. John Doe" // ⭐ Hardcoded clear example
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
                    value={form.role}
                    disabled={saving}
                    onValueChange={(value: UserRole) =>
                      setForm((c) => ({ ...c, role: value }))
                    }
                  >
                    <SelectTrigger id="user-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="user">User</SelectItem>
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
