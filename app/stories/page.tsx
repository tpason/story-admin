import { Suspense } from "react";
import { AdminShell } from "@/components/AdminShell";
import { StoriesClient } from "@/components/StoriesClient";
import { getCurrentAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function StoriesPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  return (
    <AdminShell username={admin.username}>
      <Suspense fallback={<p>Đang tải...</p>}>
        <StoriesClient />
      </Suspense>
    </AdminShell>
  );
}
