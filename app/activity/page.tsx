import { Suspense } from "react";
import { AdminAppShell } from "@/components/AdminAppShell";
import { ActivityClient } from "@/components/ActivityClient";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { requireAdminPage } from "@/lib/admin-page-guard";

export default async function ActivityPage() {
  const admin = await requireAdminPage("/activity");

  return (
    <AdminAppShell username={admin.username} adminScope={admin.adminScope}>
      <Suspense fallback={<LoadingBlock variant="table" rows={8} />}>
        <ActivityClient />
      </Suspense>
    </AdminAppShell>
  );
}
