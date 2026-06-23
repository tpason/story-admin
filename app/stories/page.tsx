import { Suspense } from "react";
import { AdminAppShell } from "@/components/AdminAppShell";
import { StoriesClient } from "@/components/StoriesClient";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { requireAdminPage } from "@/lib/admin-page-guard";

export default async function StoriesPage() {
  const admin = await requireAdminPage("/stories");

  return (
    <AdminAppShell username={admin.username} adminScope={admin.adminScope}>
      <Suspense fallback={<LoadingBlock variant="table" rows={8} />}>
        <StoriesClient />
      </Suspense>
    </AdminAppShell>
  );
}
