"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/logo-loader";

export default function FTIFuelPricePage() {
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">("loading");
  const [fuelPrice, setFuelPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/fti/fuel-price")
      .then(async (response) => {
        if (!response.ok) return { canManage: false };
        return response.json() as Promise<{ canManage?: boolean; fuelPrice?: number | null }>;
      })
      .then((data) => {
        setFuelPrice(typeof data.fuelPrice === "number" ? String(data.fuelPrice) : "");
        setAccess(data.canManage ? "allowed" : "denied");
      })
      .catch(() => setAccess("denied"));
  }, []);

  const save = async () => {
    const value = Number(fuelPrice);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a fuel price greater than zero.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/fti/fuel-price", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fuelPrice: value }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setFuelPrice(String(body.fuelPrice));
      toast.success("Shared fuel price updated for all technicians.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update fuel price.");
    } finally {
      setSaving(false);
    }
  };

  if (access === "loading") return <PageLoader label="Loading fuel price settings…" />;
  if (access === "denied") return <div className="py-12 text-center text-muted-foreground">Only the After Sales Manager can manage the shared fuel price.</div>;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div><h1 className="text-2xl font-bold">FTI Fuel Price Settings</h1><p className="text-sm text-muted-foreground">Set the fixed fuel price used for all technician FTI requests.</p></div>
      <Card>
        <CardHeader><CardTitle>Shared fuel price</CardTitle><CardDescription>New and edited FTI fuel calculations use this amount. Existing FTI records are unchanged.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="fuel-price">Fuel Price (₱/L)</Label><Input id="fuel-price" type="number" min="0" step="0.01" value={fuelPrice} onChange={(event) => setFuelPrice(event.target.value)} placeholder="0.00" /></div>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save shared price</Button>
        </CardContent>
      </Card>
    </div>
  );
}
