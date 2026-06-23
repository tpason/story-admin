import { Suspense } from "react";
import { AdminAppShell } from "@/components/AdminAppShell";
import { OperationsClient } from "@/components/OperationsClient";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { requireAdminPage } from "@/lib/admin-page-guard";

type OperationsPageProps = {
  searchParams: Promise<{ run?: string }>;
};

export default async function OperationsPage({ searchParams }: OperationsPageProps) {
  const admin = await requireAdminPage("/operations");
  const params = await searchParams;

  return (
    <AdminAppShell username={admin.username} adminScope={admin.adminScope}>
      <Suspense fallback={<LoadingBlock variant="table" rows={6} />}>
        <OperationsClient initialRunId={params.run ?? null} />
      </Suspense>
    </AdminAppShell>
  );
}
