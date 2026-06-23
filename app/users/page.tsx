import { Suspense } from "react";
import { AdminAppShell } from "@/components/AdminAppShell";
import { UsersClient } from "@/components/UsersClient";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { requireAdminPage } from "@/lib/admin-page-guard";

export default async function UsersPage() {
  const admin = await requireAdminPage("/users");

  return (
    <AdminAppShell username={admin.username} adminScope={admin.adminScope}>
      <Suspense fallback={<LoadingBlock variant="table" rows={6} />}>
        <UsersClient canManageAdmins={admin.adminScope === "full"} />
      </Suspense>
    </AdminAppShell>
  );
}
