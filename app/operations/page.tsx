import { AdminShell } from "@/components/AdminShell";
import { OperationsClient } from "@/components/OperationsClient";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

type OperationsPageProps = {
  searchParams: Promise<{ run?: string }>;
};

export default async function OperationsPage({ searchParams }: OperationsPageProps) {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");

  const params = await searchParams;

  return (
    <AdminShell username={admin.username}>
      <OperationsClient initialRunId={params.run ?? null} />
    </AdminShell>
  );
}
