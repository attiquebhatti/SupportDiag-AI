"use client";
import { useEffect, useState, useCallback } from "react";
import { Trash2, ShieldCheck, KeyRound } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, cn } from "@/lib/utils";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  authProvider: string;
  createdAt: string;
  _count: { uploads: number };
}

const ROLE_STYLES: Record<string, string> = {
  ADMIN: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  ENGINEER: "border-primary/30 bg-primary/10 text-primary",
  VIEWER: "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "Full access + team management",
  ENGINEER: "Upload, analyze, triage, report",
  VIEWER: "Read-only access to cases and findings",
};

export function TeamTable({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function changeRole(id: string, role: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setBusyId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to update role");
      return;
    }
    load();
  }

  async function removeUser(id: string, email: string) {
    if (!confirm(`Remove ${email}? Their uploads and analyses will be deleted.`)) return;
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to remove user");
      return;
    }
    load();
  }

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading team…</p>;

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-2 sm:grid-cols-3">
        {Object.entries(ROLE_DESCRIPTIONS).map(([role, desc]) => (
          <div key={role} className="rounded-lg border p-3">
            <Badge className={cn("border", ROLE_STYLES[role])}>{role}</Badge>
            <p className="mt-1.5 text-xs text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>User</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-center">Uploads</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.name}{isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {u.authProvider === "google" ? <ShieldCheck className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
                      {u.authProvider === "google" ? "Google" : "Password"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {isSelf ? (
                      <Badge className={cn("border", ROLE_STYLES[u.role])}>{u.role}</Badge>
                    ) : (
                      <select
                        value={u.role}
                        disabled={busyId === u.id}
                        onChange={(e) => changeRole(u.id, e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="ENGINEER">ENGINEER</option>
                        <option value="VIEWER">VIEWER</option>
                      </select>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">{u._count.uploads}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                  <TableCell>
                    {!isSelf && (
                      <button
                        onClick={() => removeUser(u.id, u.email)}
                        disabled={busyId === u.id}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        aria-label={`Remove ${u.email}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
