import { Suspense } from "react";
import { AdminShell } from "@/components/AdminShell";
import { ActivityClient } from "@/components/ActivityClient";
import { getCurrentAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ActivityPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  return (
    <AdminShell username={admin.username}>
      <Suspense fallback={<p>Đang tải...</p>}>
        <ActivityClient />
      </Suspense>
    </AdminShell>
  );
}
