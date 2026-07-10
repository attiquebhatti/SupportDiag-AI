import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { getCurrentUser, canAdmin } from "@/lib/auth";
import { TeamTable } from "@/components/team-table";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAdmin(user.role)) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Users className="h-6 w-6 text-primary" /> Team
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage workspace members and roles. Only admins can access this page.
        </p>
      </div>
      <TeamTable currentUserId={user.id} />
    </div>
  );
}
