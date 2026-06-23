import { Suspense } from "react";
import { AdminAppShell } from "@/components/AdminAppShell";
import { StoryDetailClient } from "@/components/StoryDetailClient";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { requireAdminPage } from "@/lib/admin-page-guard";

type PageProps = { params: Promise<{ storyId: string }> };

export default async function StoryDetailPage({ params }: PageProps) {
  const admin = await requireAdminPage("/stories");
  const { storyId } = await params;

  return (
    <AdminAppShell username={admin.username} adminScope={admin.adminScope}>
      <Suspense fallback={<LoadingBlock variant="table" rows={10} />}>
        <StoryDetailClient storyId={storyId} canRunPipeline={admin.adminScope !== "moderator"} />
      </Suspense>
    </AdminAppShell>
  );
}
