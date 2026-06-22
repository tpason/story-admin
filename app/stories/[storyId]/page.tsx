import { Suspense } from "react";
import { AdminShell } from "@/components/AdminShell";
import { StoryDetailClient } from "@/components/StoryDetailClient";
import { getCurrentAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ storyId: string }> };

export default async function StoryDetailPage({ params }: PageProps) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  const { storyId } = await params;

  return (
    <AdminShell username={admin.username}>
      <Suspense fallback={<p>Đang tải...</p>}>
        <StoryDetailClient storyId={storyId} />
      </Suspense>
    </AdminShell>
  );
}
