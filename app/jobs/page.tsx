import { Suspense } from "react";
import { AdminShell } from "@/components/AdminShell";
import { JobsClient } from "@/components/JobsClient";
import { getCurrentAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function JobsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  return (
    <AdminShell username={admin.username}>
      <Suspense fallback={<p>Đang tải...</p>}>
        <JobsClient />
      </Suspense>
    </AdminShell>
  );
}
