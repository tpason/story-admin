import { AdminAppShell } from "@/components/AdminAppShell";
import { ChapterEditorClient } from "@/components/ChapterEditorClient";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ storyId: string; chapterNumber: string }> };

export default async function ChapterEditorPage({ params }: PageProps) {
  const admin = await requireAdminPage("/stories");
  const { storyId, chapterNumber } = await params;
  const chapterNum = Number(chapterNumber);
  if (!Number.isFinite(chapterNum)) redirect(`/stories/${storyId}`);

  return (
    <AdminAppShell username={admin.username} adminScope={admin.adminScope}>
      <ChapterEditorClient
        storyId={storyId}
        chapterNumber={chapterNum}
        canRunPipeline={admin.adminScope !== "moderator"}
      />
    </AdminAppShell>
  );
}
