"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmRejectDialogProps {
  open: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmRejectDialog({
  open,
  onConfirm,
  onClose,
}: ConfirmRejectDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);

  const close = () => {
    setConfirmation("");
    onClose();
  };

  const confirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      close();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !loading && close()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm Reject</DialogTitle>
          <DialogDescription>
            This will reject the request. Type <span className="font-mono font-semibold">reject</span> to continue.
          </DialogDescription>
        </DialogHeader>
        <Input
          id="reject-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="reject"
          autoComplete="off"
          disabled={loading}
        />
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={loading || confirmation !== "reject"}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
