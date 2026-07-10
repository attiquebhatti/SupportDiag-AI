"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, UploadCloud, FolderSearch, AlertTriangle, Bot,
  Boxes, FileText, BookOpen, Settings, LogOut, Menu, Search, Bell,
  HelpCircle, ChevronDown, Shield, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/brand-logo";

// minRole: VIEWER = everyone, ENGINEER = writers, ADMIN = admins only.
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minRole: "VIEWER" },
  { href: "/upload", label: "New Analysis", icon: UploadCloud, minRole: "ENGINEER" },
  { href: "/cases", label: "Cases / Analyses", icon: FolderSearch, minRole: "VIEWER" },
  { href: "/findings", label: "Findings", icon: AlertTriangle, minRole: "VIEWER" },
  { href: "/investigator", label: "AI Investigator", icon: Bot, minRole: "VIEWER" },
  { href: "/parsers", label: "Vendor Parsers", icon: Boxes, minRole: "VIEWER" },
  { href: "/reports", label: "Reports", icon: FileText, minRole: "VIEWER" },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen, minRole: "VIEWER" },
  { href: "/team", label: "Team", icon: Users, minRole: "ADMIN" },
  { href: "/settings", label: "Settings", icon: Settings, minRole: "VIEWER" },
];

const ROLE_LEVEL: Record<string, number> = { VIEWER: 0, ENGINEER: 1, ADMIN: 2 };

function navForRole(role: string) {
  const level = ROLE_LEVEL[role] ?? 0;
  return NAV.filter((item) => level >= (ROLE_LEVEL[item.minRole] ?? 0));
}

const ROLE_STYLES: Record<string, string> = {
  ADMIN: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  ENGINEER: "border-primary/30 bg-primary/10 text-primary",
  VIEWER: "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

export function AppShell({
  children,
  user,
  workspace = "Default Workspace",
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: string };
  workspace?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="app-bg flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card/60 backdrop-blur-xl transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b px-4">
          <BrandLogo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">FirewallLens AI</div>
            <div className="text-[10px] text-muted-foreground">Security Support File Analyzer</div>
          </div>
        </div>

        {/* Workspace selector */}
        <div className="px-3 pt-3">
          <button className="flex w-full items-center justify-between rounded-lg border bg-background/50 px-3 py-2 text-left text-sm hover:bg-accent">
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="truncate font-medium">{workspace}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto thin-scroll p-3">
          {navForRole(user.role).map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium shadow-[inset_2px_0_0_hsl(var(--primary))]"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-4 w-4", active ? "text-primary" : "opacity-70 group-hover:opacity-100")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-background/50 p-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{user.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{user.email}</div>
            </div>
            <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-medium", ROLE_STYLES[user.role] ?? ROLE_STYLES.VIEWER)}>
              {user.role}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/70 px-4 backdrop-blur-xl">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>

          <button
            onClick={() => router.push("/findings")}
            className="hidden items-center gap-2 rounded-lg border bg-background/50 px-3 py-2 text-sm text-muted-foreground hover:bg-accent sm:flex sm:w-72"
          >
            <Search className="h-4 w-4" />
            <span>Search cases, findings, evidence…</span>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {user.role !== "VIEWER" && (
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/upload">
                  <UploadCloud className="h-4 w-4" /> Upload support file
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Help">
              <Link href="/knowledge-base"><HelpCircle className="h-4 w-4" /></Link>
            </Button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
              >
                {user.name.slice(0, 2).toUpperCase()}
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border bg-popover p-1 shadow-lg" onMouseLeave={() => setMenuOpen(false)}>
                  <div className="px-3 py-2 text-xs">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-muted-foreground">{workspace}</div>
                  </div>
                  <Link href="/settings" className="block rounded-md px-3 py-1.5 text-sm hover:bg-accent" onClick={() => setMenuOpen(false)}>Settings</Link>
                  <button onClick={logout} className="block w-full rounded-md px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent">Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
