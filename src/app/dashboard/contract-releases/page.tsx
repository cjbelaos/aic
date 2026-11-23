"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Users } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DeliveryReceiptPreviewModal } from "@/components/delivery-receipt-preview-modal";
import contractService from "@/lib/services/contract.service";
import companyService from "@/lib/services/company.service";
import contractReleaseService from "@/lib/services/contractRelease.service";
import { effectiveContractStatus, manilaToday } from "@/lib/contractStatus";
import type { AgreementLedger, BacklogCustomer, CustomerLedger } from "@/types/contract-release";
import type { DeliveryReceiptResponse } from "@/types/deliveryReceipt";
import { BacklogList } from "./backlog-list";
import { CustomerPanel } from "./customer-panel";
import { ReleaseSheet } from "./release-sheet";
import { monthLabel } from "./format";

function Tile({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <Icon className={`h-5 w-5 shrink-0 ${tone ?? "text-muted-foreground"}`} />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ContractReleasesPage() {
  const router = useRouter();
  const today = manilaToday();
  const [backlog, setBacklog] = useState<BacklogCustomer[]>([]);
  const [backlogLoading, setBacklogLoading] = useState(true);
  const [activeCustomers, setActiveCustomers] = useState<{ value: string; label: string }[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customer, setCustomer] = useState<CustomerLedger | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [releaseAgreement, setReleaseAgreement] = useState<AgreementLedger | null>(null);
  const [drPreview, setDrPreview] = useState<DeliveryReceiptResponse | null>(null);

  const loadBacklog = useCallback(async () => {
    try {
      setBacklog(await contractReleaseService.getBacklog());
    } catch {
      toast.error("Failed to load the release backlog.");
    } finally {
      setBacklogLoading(false);
    }
  }, []);

  const loadCustomer = useCallback(async (companyId: string) => {
    if (!companyId) {
      setCustomer(null);
      return;
    }
    setCustomerLoading(true);
    try {
      setCustomer(await contractReleaseService.getCustomerLedger(companyId));
    } catch {
      toast.error("Failed to load the customer's agreements.");
      setCustomer(null);
    } finally {
      setCustomerLoading(false);
    }
  }, []);

  // Initial load: backlog, searchable customers, and the customer kept in the URL.
  useEffect(() => {
    (async () => {
      const fromUrl = new URLSearchParams(window.location.search).get("customer") || "";
      if (fromUrl) {
        setCustomerId(fromUrl);
        void loadCustomer(fromUrl);
      }
      void loadBacklog();
      try {
        const [contracts, companies] = await Promise.all([contractService.getAll(), companyService.getAll()]);
        const ids = new Set(contracts.filter((c) => effectiveContractStatus(c) === "Active").map((c) => c.companyId));
        setActiveCustomers(
          companies
            .filter((c) => ids.has(c.companyId))
            .map((c) => ({ value: c.companyId, label: c.companyName }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        );
      } catch {
        setActiveCustomers([]);
      }
    })();
  }, [loadBacklog, loadCustomer]);

  const selectCustomer = (companyId: string) => {
    setCustomerId(companyId);
    loadCustomer(companyId);
    router.replace(companyId ? `?customer=${encodeURIComponent(companyId)}` : "?", { scroll: false });
  };

  const customerOptions = useMemo(() => {
    const seen = new Map(activeCustomers.map((c) => [c.value, c]));
    for (const b of backlog) if (!seen.has(b.companyId)) seen.set(b.companyId, { value: b.companyId, label: b.companyName });
    return [...seen.values()];
  }, [activeCustomers, backlog]);

  const overduePeriods = backlog.reduce((n, b) => n + b.overduePeriods, 0);
  const oldestOverdue = backlog.map((b) => b.oldestOverdue).filter(Boolean).sort()[0] || "";

  const afterRelease = (res: DeliveryReceiptResponse) => {
    if (res.status !== "pending_approval") setDrPreview(res);
    loadBacklog();
    loadCustomer(customerId);
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contract Releases</h1>
          <p className="text-sm text-muted-foreground">What each customer is owed on their active agreements. Release it on one DR per agreement.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile icon={Users} label="Customers owed" value={backlog.length} />
          <Tile icon={AlertTriangle} label="Overdue periods" value={overduePeriods} tone={overduePeriods ? "text-destructive" : undefined} />
          <Tile icon={CalendarClock} label="Oldest overdue period" value={oldestOverdue ? monthLabel(oldestOverdue) : "None"} />
        </div>

        <div className="max-w-md">
          <SearchableSelect
            value={customerId}
            onValueChange={selectCustomer}
            options={customerOptions}
            placeholder="Find a customer"
            searchPlaceholder="Search customers..."
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <BacklogList backlog={backlog} loading={backlogLoading} selectedId={customerId} onSelect={selectCustomer} />
          <CustomerPanel
            customer={customer}
            loading={customerLoading}
            today={today}
            onRelease={setReleaseAgreement}
            onPreview={setDrPreview}
          />
        </div>
      </div>

      {customer && releaseAgreement && (
        <ReleaseSheet
          customer={customer}
          agreement={releaseAgreement}
          open={!!releaseAgreement}
          onOpenChange={(v) => !v && setReleaseAgreement(null)}
          onReleased={afterRelease}
        />
      )}

      <DeliveryReceiptPreviewModal key={drPreview?.drNumber ?? "dr-preview"} dr={drPreview} open={!!drPreview} onOpenChange={(v) => !v && setDrPreview(null)} />
    </>
  );
}
