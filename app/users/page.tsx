import { AdminShell } from "@/components/AdminShell";
import { UsersClient } from "@/components/UsersClient";
import { getCurrentAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function UsersPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  return (
    <AdminShell username={admin.username}>
      <UsersClient />
    </AdminShell>
  );
}
