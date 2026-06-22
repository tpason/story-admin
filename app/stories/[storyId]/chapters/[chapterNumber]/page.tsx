import { AdminShell } from "@/components/AdminShell";
import { ChapterEditorClient } from "@/components/ChapterEditorClient";
import { getCurrentAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ storyId: string; chapterNumber: string }> };

export default async function ChapterEditorPage({ params }: PageProps) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  const { storyId, chapterNumber } = await params;
  const chapterNum = Number(chapterNumber);
  if (!Number.isFinite(chapterNum)) redirect(`/stories/${storyId}`);

  return (
    <AdminShell username={admin.username}>
      <ChapterEditorClient storyId={storyId} chapterNumber={chapterNum} />
    </AdminShell>
  );
}
