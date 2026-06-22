export type CoreDashboardStats = {
  totalStories: number;
  activeStories: number;
  totalChapters: number;
  polishedChapters: number;
  translatedChapters: number;
  audioChapters: number;
  pendingJobs: number;
  runningJobs: number;
  failedJobs: number;
};

export type DashboardStats = CoreDashboardStats & {
  runningPipelineRuns: number;
  failedPipelineRuns24h: number;
};

export type PipelineRunSummary = {
  id: string;
  action: string;
  status: string;
  storyId: string | null;
  summary: string | null;
  createdAt: string;
};

export type AdminStoryRow = {
  id: string;
  title: string;
  displayTitle: string | null;
  originalTitle: string | null;
  author: string | null;
  category: string | null;
  status: string | null;
  description: string | null;
  coverImageUrl: string | null;
  totalChapters: number;
  isCompleted: boolean;
  isActive: boolean;
  sourceCode: string;
  sourceUrl: string | null;
  slug: string | null;
  updatedAt: string;
  chapterCount: number;
  polishedCount: number;
  audioCount: number;
};

export type AdminStoryDetail = AdminStoryRow & {
  metadata: Record<string, unknown> | null;
};

export type AdminChapterSummary = {
  id: string;
  storyId: string;
  chapterNumber: number;
  title: string;
  isDownloaded: boolean;
  isTranslated: boolean;
  isPolished: boolean;
  isAudioGenerated: boolean;
  hasRawText: boolean;
  hasTranslatedText: boolean;
  hasPolishedText: boolean;
  hasAudio: boolean;
  updatedAt: string | null;
  hasFailedJob: boolean;
  outputRatio: number | null;
  qualityIssues: string[];
};

export type AdminChapterDetail = AdminChapterSummary & {
  rawTextContent: string | null;
  translatedTextContent: string | null;
  polishedTextContent: string | null;
  contentSource: "polished" | "translated" | "raw" | null;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AdminJobRow = {
  id: string;
  jobType: string;
  status: string;
  storyId: string | null;
  storyTitle: string | null;
  chapterId: string | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  sourceCode: string | null;
  attempts: number;
  maxAttempts: number;
  priority: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  runAfter: string | null;
};

export type ActivityLogRow = {
  id: string;
  adminUsername: string;
  action: string;
  entityType: string;
  entityId: string | null;
  storyId: string | null;
  chapterNumber: number | null;
  summary: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type AdminUserRow = {
  id: string;
  username: string;
  email: string | null;
  role: "reader" | "admin";
  createdAt: string;
  updatedAt: string;
};
