import {
  Shield, Radar, Search, UploadCloud, FileArchive, Server, Network,
  AlertTriangle, Flame, Activity, Brain, FileText, Download, Settings,
  Lock, Database, Bot, Route, Cable, Cloud, Terminal, HelpCircle,
  type LucideIcon,
} from "lucide-react";

// String-name → Lucide component map so the shared taxonomy can reference icons
// without importing React components into pure-data modules.
const ICONS: Record<string, LucideIcon> = {
  Shield, Radar, Search, UploadCloud, FileArchive, Server, Network,
  AlertTriangle, Flame, Activity, Brain, FileText, Download, Settings,
  Lock, Database, Bot, Route, Cable, Cloud, Terminal,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = ICONS[name] ?? HelpCircle;
  return <Cmp className={className} />;
}
