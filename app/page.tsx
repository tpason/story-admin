import { AdminShell } from "@/components/AdminShell";
import { DashboardClient } from "@/components/DashboardClient";
import { getCurrentAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  return (
    <AdminShell username={admin.username}>
      <DashboardClient />
    </AdminShell>
  );
}
