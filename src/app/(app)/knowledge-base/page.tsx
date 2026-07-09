import { BookOpen, Wrench, ListChecks, Sparkles, StickyNote, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SECTIONS = [
  { icon: Wrench, title: "Vendor Troubleshooting Notes", desc: "Curated troubleshooting playbooks per vendor and product.", items: ["PAN-OS HA failover checklist", "Panorama commit-all recovery", "Cortex agent connectivity triage", "FortiGate conserve mode response"] },
  { icon: ListChecks, title: "Rule Explanations", desc: "What each diagnostic rule checks, why it matters, and how to remediate.", items: ["Why any-any allow rules are flagged", "HA config sync failures", "Expired subscription impact"] },
  { icon: Sparkles, title: "Common Issue Patterns", desc: "Recurring root-cause patterns observed across support bundles.", items: ["High dataplane CPU under decryption load", "Tunnel monitor flapping", "Ingestion backlog signatures"] },
  { icon: ShieldCheck, title: "Best-Practice Checks", desc: "Hardening and hygiene baselines used by the rule engine.", items: ["Logging on all allow rules", "Security profiles on internet-facing rules", "Content update scheduling"] },
  { icon: StickyNote, title: "User-Created Notes", desc: "Your team's private notes. Will feed the AI Investigator's private RAG in a future release.", items: [] },
];

export default function KnowledgeBasePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><BookOpen className="h-6 w-6 text-primary" /> Knowledge Base</h1>
        <p className="text-sm text-muted-foreground">Troubleshooting knowledge and best practices. This section will power private, evidence-grounded RAG for the AI Investigator.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.title} className="card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <s.icon className="h-4 w-4 text-primary" /> {s.title}
                <Badge className="ml-auto border-slate-500/30 bg-slate-500/10 text-slate-400">Coming soon</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
              {s.items.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {s.items.map((it) => (
                    <li key={it} className="flex items-center gap-2 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" /> {it}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
