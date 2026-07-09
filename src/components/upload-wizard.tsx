"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileArchive, Loader2, ShieldCheck, Check, ChevronRight, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn, formatBytes } from "@/lib/utils";
import { VENDORS, productsForVendor, type VendorId } from "@/lib/vendors";
import { Icon } from "@/components/icon";

const ACCEPTED = [".tgz", ".tar.gz", ".tar", ".zip", ".log", ".txt", ".json", ".xml"];
const STEPS = ["Vendor", "Product", "Upload", "Options"];

const OPTIONS = [
  { key: "redact", label: "Redact sensitive data", default: true, note: "Passwords, keys, tokens, serials, IPs" },
  { key: "aiSummary", label: "Generate AI summary", default: true, note: "Evidence-grounded executive summary" },
  { key: "bestPractice", label: "Run best-practice checks", default: true },
  { key: "healthDiag", label: "Run health diagnostics", default: true },
  { key: "deepScan", label: "Enable deep log scan", default: false, note: "Scans all indexed logs for errors" },
  { key: "autoReport", label: "Generate report after completion", default: false },
];

export function UploadWizard({ maxUploadMb }: { maxUploadMb: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [vendor, setVendor] = useState<string>("auto");
  const [product, setProduct] = useState<string>("auto");
  const [file, setFile] = useState<File | null>(null);
  const [opts, setOpts] = useState<Record<string, boolean>>(Object.fromEntries(OPTIONS.map((o) => [o.key, o.default])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const vendorList: Array<{ id: string; label: string; icon: string }> = [
    ...Object.values(VENDORS).map((v) => ({ id: v.id, label: v.label, icon: v.icon })),
    { id: "auto", label: "Auto-detect", icon: "Radar" },
  ];
  const products = vendor !== "auto" ? productsForVendor(vendor as VendorId) : [];

  const MAX_MB = maxUploadMb;

  function pickFile(f: File | null) {
    setError(null);
    if (!f) return;
    if (!ACCEPTED.some((e) => f.name.toLowerCase().endsWith(e))) {
      setError(`Unsupported file type. Allowed: ${ACCEPTED.join(", ")}`);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`"${f.name}" is ${(f.size / 1024 / 1024).toFixed(1)} MB — the maximum upload size is ${MAX_MB} MB.`);
      return;
    }
    setFile(f);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("selectedVendor", vendor);
    fd.append("selectedProduct", product);
    fd.append("redact", String(opts.redact));
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Upload failed");
      setBusy(false);
      return;
    }
    const { upload } = await res.json();
    fetch(`/api/uploads/${upload.id}/process`, { method: "POST" }).catch(() => {});
    router.push(`/uploads/${upload.id}/status`);
  }

  const canNext = step === 0 ? true : step === 1 ? true : step === 2 ? !!file : true;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Diagnostic Analysis</h1>
        <p className="text-sm text-muted-foreground">Upload a vendor support bundle to generate evidence-based findings. Files are stored securely, extracted safely, and never executed.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
              i < step ? "border-primary bg-primary text-primary-foreground" : i === step ? "border-primary text-primary" : "border-border text-muted-foreground")}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn("text-xs font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <div className={cn("h-px flex-1", i < step ? "bg-primary" : "bg-border")} />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          {/* Step 1: Vendor */}
          {step === 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Select vendor</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {vendorList.map((v) => (
                  <button key={v.id} onClick={() => { setVendor(v.id); setProduct("auto"); }}
                    className={cn("flex items-center gap-3 rounded-lg border p-4 text-left transition-colors card-hover",
                      vendor === v.id ? "border-primary bg-primary/5" : "hover:bg-accent")}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Icon name={v.icon} className="h-5 w-5 text-primary" /></div>
                    <div>
                      <div className="font-medium">{v.label}</div>
                      {v.id === "auto" && <div className="text-xs text-muted-foreground">Let FirewallLens identify the vendor</div>}
                    </div>
                    {vendor === v.id && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Product */}
          {step === 1 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Select product</h2>
              {vendor === "auto" ? (
                <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  <Wand2 className="h-5 w-5 text-primary" /> Vendor is set to auto-detect. The product will be identified from the uploaded evidence.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button onClick={() => setProduct("auto")} className={cn("flex items-center gap-3 rounded-lg border p-4 text-left card-hover", product === "auto" ? "border-primary bg-primary/5" : "hover:bg-accent")}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Icon name="Radar" className="h-5 w-5 text-primary" /></div>
                    <div className="font-medium">Auto-detect</div>
                    {product === "auto" && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </button>
                  {products.map((p) => (
                    <button key={p.id} onClick={() => setProduct(p.id)}
                      className={cn("flex items-center gap-3 rounded-lg border p-4 text-left card-hover", product === p.id ? "border-primary bg-primary/5" : "hover:bg-accent")}>
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Icon name={p.icon} className="h-5 w-5 text-primary" /></div>
                      <div>
                        <div className="font-medium">{p.shortLabel}</div>
                        <div className="text-xs text-muted-foreground">{p.blurb}</div>
                      </div>
                      {product === p.id && <Check className="ml-auto h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Upload */}
          {step === 2 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Upload file</h2>
              <div onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0] ?? null); }}
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors hover:border-primary/50">
                <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Drag & drop or click to browse</p>
                <p className="mt-1 text-xs text-muted-foreground">Supported: {ACCEPTED.join(", ")} · Max {MAX_MB} MB</p>
                <input ref={inputRef} type="file" className="hidden" accept={ACCEPTED.join(",")} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              </div>
              {file && (
                <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                  <FileArchive className="h-5 w-5 text-primary" />
                  <div className="flex-1"><div className="text-sm font-medium">{file.name}</div><div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div></div>
                  <Button variant="ghost" size="sm" onClick={() => setFile(null)}>Remove</Button>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Options */}
          {step === 3 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Analysis options</h2>
              <div className="space-y-2">
                {OPTIONS.map((o) => (
                  <div key={o.key} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="text-sm font-medium">{o.label}</div>
                      {o.note && <div className="text-xs text-muted-foreground">{o.note}</div>}
                    </div>
                    <Switch checked={opts[o.key]} onCheckedChange={(v) => setOpts((s) => ({ ...s, [o.key]: v }))} />
                  </div>
                ))}
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Summary:</span> {vendor === "auto" ? "Auto-detect vendor" : VENDORS[vendor as VendorId]?.label}
                {" · "}{product === "auto" ? "Auto-detect product" : product}
                {" · "}{file?.name ?? "no file"}
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

          {/* Nav */}
          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>Back</Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>Continue <ChevronRight className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={submit} disabled={!file || busy}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</> : <>Start analysis</>}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-300">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Sensitive values are redacted by default before AI processing and in reports. This platform is independent and does not replace official vendor TAC support.</p>
      </div>
    </div>
  );
}
