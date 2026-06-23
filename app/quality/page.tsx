import { Suspense } from "react";
import { AdminAppShell } from "@/components/AdminAppShell";
import { QualityClient } from "@/components/QualityClient";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { requireAdminPage } from "@/lib/admin-page-guard";

export default async function QualityPage() {
  const admin = await requireAdminPage("/quality");

  return (
    <AdminAppShell username={admin.username} adminScope={admin.adminScope}>
      <Suspense fallback={<LoadingBlock variant="table" rows={8} />}>
        <QualityClient />
      </Suspense>
    </AdminAppShell>
  );
}
