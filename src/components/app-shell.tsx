"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Upload,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-60 -translate-x-full border-r bg-card transition-transform md:static md:translate-x-0",
          open && "translate-x-0"
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">FirewallLens AI</div>
            <div className="text-[10px] text-muted-foreground">Support File Analyzer</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t p-3">
          <div className="mb-2 px-1 text-xs">
            <div className="font-medium">{user.name}</div>
            <div className="text-muted-foreground">{user.role}</div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold">FirewallLens AI</span>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
