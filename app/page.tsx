import { AdminAppShell } from "@/components/AdminAppShell";
import { DashboardClient } from "@/components/DashboardClient";
import { requireAdminPage } from "@/lib/admin-page-guard";

export default async function DashboardPage() {
  const admin = await requireAdminPage("/");

  return (
    <AdminAppShell username={admin.username} adminScope={admin.adminScope}>
      <DashboardClient />
    </AdminAppShell>
  );
}
