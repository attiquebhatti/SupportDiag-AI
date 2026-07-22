"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SOURCE_VENDORS = [
  "checkpoint",
  "fortigate",
  "cisco-asa",
  "cisco-ftd",
  "juniper-srx",
  "sophos",
  "sonicwall",
  "panos",
  "other",
];

const TARGETS = [
  { value: "STANDALONE_PANOS", label: "Standalone PAN-OS" },
  { value: "PANORAMA", label: "Panorama" },
  { value: "SCM", label: "Strata Cloud Manager" },
  { value: "PRISMA_ACCESS", label: "Prisma Access" },
];

export function CreateMigrationProject() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sourceVendor, setSourceVendor] = useState("checkpoint");
  const [targetManagementType, setTarget] = useState("STANDALONE_PANOS");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/migrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sourceVendor, targetManagementType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the project");
      router.push(`/migrations/${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        New Migration Project
      </Button>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardContent className="pt-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mp-name">Project name</Label>
            <Input
              id="mp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Branch firewalls — Check Point to PAN-OS"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mp-vendor">Source vendor</Label>
              <select
                id="mp-vendor"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={sourceVendor}
                onChange={(e) => setSourceVendor(e.target.value)}
              >
                {SOURCE_VENDORS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-target">Target</Label>
              <select
                id="mp-target"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={targetManagementType}
                onChange={(e) => setTarget(e.target.value)}
              >
                {TARGETS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !name}>
              {busy ? "Creating…" : "Create project"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
