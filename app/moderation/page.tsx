import { Suspense } from "react";
import { AdminAppShell } from "@/components/AdminAppShell";
import { ModerationClient } from "@/components/ModerationClient";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { hasPermission } from "@/lib/admin-rbac";

export default async function ModerationPage() {
  const admin = await requireAdminPage("/moderation");

  return (
    <AdminAppShell username={admin.username} adminScope={admin.adminScope}>
      <Suspense fallback={<LoadingBlock variant="table" rows={5} />}>
        <ModerationClient canAccessStories={hasPermission(admin.adminScope, "stories")} />
      </Suspense>
    </AdminAppShell>
  );
}
