import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = user.organizationId
    ? await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } })
    : null;
  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      workspace={org?.name ?? "Default Workspace"}
    >
      {children}
    </AppShell>
  );
}
