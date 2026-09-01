"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityTable } from "@/components/ui/entity-table";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
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
import { userService } from "@/lib/services/user.service";
import { departmentService } from "@/lib/services/department.service";
import { positionService } from "@/lib/services/position.service";
import { userApproverService } from "@/lib/services/userApprover.service";
import { isExecutivePositionTitle } from "@/lib/positionUtils";
import type { ColumnDef } from "@tanstack/react-table";
import type { PublicUser } from "@/types/user";
import type { Department } from "@/types/department";
import type { Position } from "@/types/position";
import type { UserApprover } from "@/types/userApprover";

interface ApproverFormState {
  departmentId: number;
  requesterUserId: string;
  approverUserId: string;
  approvalLevel: number;
}

const EMPTY_FORM: ApproverFormState = {
  departmentId: 0,
  requesterUserId: "",
  approverUserId: "",
  approvalLevel: 1,
};

export default function UserApproversPage() {
  const [data, setData] = useState<UserApprover[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ApproverFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<UserApprover | null>(null);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<number>(2);

  const isAdmin = useMemo(() => currentUserRoleId === 1, [currentUserRoleId]);

  const userMap = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const u of users) map.set(u.userId, u);
    return map;
  }, [users]);

  const deptMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of departments) map.set(d.departmentId, d.departmentName);
    return map;
  }, [departments]);

  const sameDeptUsers = useMemo(() => {
    if (form.departmentId === 0) return [];
    return users.filter((u) => u.departmentId === form.departmentId);
  }, [users, form.departmentId]);

  // Executive positions (General Manager, CFO, COO, CEO) may approve for ANY
  // requester regardless of department, so they are always selectable.
  const executiveUserIds = useMemo(() => {
    const ids = new Set<string>();
    const posTitles = new Map<number, string>();
    for (const p of positions) posTitles.set(p.positionId, p.positionTitle);
    for (const u of users) {
      const title = u.positionId ? posTitles.get(u.positionId) : undefined;
      if (isExecutivePositionTitle(title)) ids.add(u.userId);
    }
    return ids;
  }, [users, positions]);

  // Approver candidates = same-department users + executives (no duplicates).
  const approverCandidates = useMemo(() => {
    const seen = new Set<string>();
    const list: PublicUser[] = [];
    for (const u of sameDeptUsers) {
      if (!seen.has(u.userId)) {
        seen.add(u.userId);
        list.push(u);
      }
    }
    for (const u of users) {
      if (executiveUserIds.has(u.userId) && !seen.has(u.userId)) {
        seen.add(u.userId);
        list.push(u);
      }
    }
    return list;
  }, [sameDeptUsers, users, executiveUserIds]);

  const columns = useMemo<ColumnDef<UserApprover>[]>(
    () => [
      {
        id: "requester",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 font-semibold"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Requester <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => {
          const u = userMap.get(row.original.requesterUserId);
          return (
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {u ? u.fullName || u.username : row.original.requesterUserId}
            </span>
          );
        },
      },
      {
        id: "department",
        header: "Department",
        cell: ({ row }) => {
          const name = deptMap.get(row.original.departmentId);
          return <span>{name || `#${row.original.departmentId}`}</span>;
        },
      },
      {
        id: "approver",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 font-semibold"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Approver <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => {
          const u = userMap.get(row.original.approverUserId);
          return (
            <span className="font-medium text-blue-600">
              {u ? u.fullName || u.username : row.original.approverUserId}
            </span>
          );
        },
      },
      {
        accessorKey: "approvalLevel",
        header: "Approval Level",
        cell: ({ row }) => (
          <Badge variant="secondary">Level {row.original.approvalLevel}</Badge>
        ),
      },
    ],
    [userMap, deptMap],
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [approvers, allUsers, depts, poss] = await Promise.all([
        userApproverService.getAll(),
        userService.getAllUsers(),
        departmentService.getAll(),
        positionService.getAll(),
      ]);
      setData(approvers);
      setUsers(allUsers);
      setDepartments(depts);
      setPositions(poss);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

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

    loadData();
  }, [loadData]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.requesterUserId) {
      setError("Please select a requester.");
      return;
    }
    if (form.departmentId === 0) {
      setError(
        "The selected requester has no department assigned. Assign a department to the requester first.",
      );
      return;
    }
    if (!form.approverUserId) {
      setError("Please select an approver.");
      return;
    }
    if (form.approverUserId === form.requesterUserId) {
      setError("A user cannot be their own approver.");
      return;
    }
    const approverIsExecutive = executiveUserIds.has(form.approverUserId);
    if (
      !approverIsExecutive &&
      !sameDeptUsers.some((u) => u.userId === form.approverUserId)
    ) {
      setError(
        "Approver must be in the same department as the requester or hold an executive position (General Manager, CFO, COO, CEO).",
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      await userApproverService.create({
        departmentId: form.departmentId,
        requesterUserId: form.requesterUserId,
        approverUserId: form.approverUserId,
        approvalLevel: form.approvalLevel,
      });
      toast.success("User-approver mapping created successfully.");
      await loadData();
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
      await userApproverService.remove(deleteTarget.configId);
      toast.success("User-approver mapping deleted successfully.");
      await loadData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete mapping.",
      );
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <EntityTable
        title="User Approvers"
        columns={columns}
        data={data}
        loading={loading}
        onCreateNew={isAdmin ? openCreate : undefined}
        onDelete={isAdmin ? (row) => setDeleteTarget(row) : undefined}
      />

      {!isAdmin && !loading && (
        <p className="text-sm text-muted-foreground mt-4">
          You have read-only access. Contact an administrator to manage
          user-approver mappings.
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
              onInteractOutside={(e) => e.preventDefault()}
              onPointerDownOutside={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle>Add User-Approver Mapping</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="space-y-1.5">
                  <Label htmlFor="ua-requester">Requester *</Label>
                  <Select
                    value={form.requesterUserId}
                    disabled={saving}
                    onValueChange={(value) =>
                      setForm((c) => ({
                        ...c,
                        requesterUserId: value,
                        departmentId: userMap.get(value)?.departmentId ?? 0,
                        approverUserId: "",
                      }))
                    }
                  >
                    <SelectTrigger id="ua-requester" className="w-full">
                      <SelectValue placeholder="Select requester" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.userId} value={u.userId}>
                          {u.fullName || u.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ua-department">Department *</Label>
                  <Input
                    id="ua-department"
                    value={
                      deptMap.get(form.departmentId) ||
                      (form.departmentId === 0
                        ? "No department assigned"
                        : `#${form.departmentId}`)
                    }
                    readOnly
                    disabled={saving}
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-filled from the selected requester's department.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ua-approver">Approver *</Label>
                  <Select
                    value={form.approverUserId}
                    disabled={saving}
                    onValueChange={(value) =>
                      setForm((c) => ({ ...c, approverUserId: value }))
                    }
                  >
                    <SelectTrigger id="ua-approver" className="w-full">
                      <SelectValue placeholder="Select approver" />
                    </SelectTrigger>
                    <SelectContent>
                      {approverCandidates.map((u) => (
                        <SelectItem key={u.userId} value={u.userId}>
                          {u.fullName || u.username}
                        </SelectItem>
                      ))}
                      {approverCandidates.length === 0 && (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No eligible approvers found.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Users in the same department as the requester, plus
                    executives (General Manager, CFO, COO, CEO), are shown.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ua-level">Approval Level</Label>
                  <Select
                    value={String(form.approvalLevel)}
                    disabled={saving}
                    onValueChange={(value) =>
                      setForm((c) => ({ ...c, approvalLevel: Number(value) }))
                    }
                  >
                    <SelectTrigger id="ua-level" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((level) => (
                        <SelectItem key={level} value={String(level)}>
                          Level {level}
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
                  Add Mapping
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ConfirmDeleteDialog
            open={!!deleteTarget}
            description="Delete this user-approver mapping? This cannot be undone."
            onConfirm={handleDelete}
            onClose={() => setDeleteTarget(null)}
          />
        </>
      )}
    </>
  );
}
