# story-admin

Next.js admin UI quản lý stories/chapters trong PostgreSQL BetterBox pipeline.

Repo tách từ [BetterBox-TTS](https://github.com/tpason/BetterBox-TTS) — chạy cùng stack Docker/DB với pipeline gốc.

**Production: chạy qua Docker** (cùng stack với story-reader).

## Docker (khuyến nghị)

Từ root repo (sau khi DB đã chạy — xem `DOCKER_RUNBOOK.md`):

```bash
# Lần đầu hoặc sau khi đổi code admin
docker compose up -d --build story-db-migrate story-admin

# Hoặc cùng toàn bộ stack base
docker compose up -d --build
```

- Admin UI: http://localhost:3001 (`STORY_ADMIN_PORT`)
- Reader: http://localhost:3000 (`STORY_READER_PORT`)
- Migrations (gồm `admin_activity_log`) chạy tự động qua service `story-db-migrate`

Env (root `.env` từ `docker/env.example`):

```env
STORY_ADMIN_PORT=3001
NEXT_PUBLIC_STORY_READER_URL=http://localhost:3000
# COOKIE_SECURE=false   # nếu truy cập qua HTTP trên LAN
```

Kiểm tra:

```bash
docker compose ps story-admin
docker compose logs -f story-admin
curl -s http://localhost:3001/api/health
```

Rebuild sau khi sửa code:

```bash
docker compose up -d --build story-admin
```

## Local dev (tùy chọn)

Chỉ dùng khi debug UI — production vẫn nên qua Docker.

```bash
cd story_admin
cp .env.example .env.local
npm install
npm run dev
```

## Đăng nhập

Tài khoản `reader_users` với `role = admin` (cùng bảng story_reader).

Tạo/promote user: `/users` trong admin UI (sau khi đã có 1 admin).

## Tính năng

- Dashboard, quản lý truyện/chapter, char map editor
- Job queue (`/jobs`), activity log (`/activity`), users (`/users`)
- Bulk enqueue polish/audio/segments, quality flags, reader preview
- **Re-polish / re-translate** — gọi `admin_pipeline_cli.py` → `check_translation_quality.py` / `reset_polished_for_repolish` / `retranslate_bad_chapters`
- **Re-crawl** — `repository.request_story_recrawl()` / `request_chapter_recrawl()`
- **Dịch metadata** — `backfill_metadata_titles.py` (Ollama)

Admin UI **không** implement lại business logic trong TypeScript — chỉ spawn Python CLI.

### Pipeline actions (story detail)

| UI action | Python entry |
|---|---|
| Re-polish (chapter/range) | `admin_pipeline_cli.py repolish` → `reset_polished_for_repolish` |
| Re-polish (quality) | `check_translation_quality.py --repolish-bad` |
| Re-translate | `admin_pipeline_cli.py retranslate` → `retranslate_bad_chapters` |
| Re-crawl catalog | `admin_pipeline_cli.py recrawl-story` |
| Re-crawl chapters | `admin_pipeline_cli.py recrawl-chapters` |
| Dịch metadata | `admin_pipeline_cli.py translate-metadata` → `backfill_metadata_titles.py` |

### QA audit (admin hỗ trợ rà soát — user trigger)

- **Pipeline scripts** (`polish_worker`, `chapter_save_guard`, …): kiểm tra chất lượng khi dịch/polish — **không đổi**.
- **Admin**: xem `quality_status` / lỗi, triage (`/quality`), lọc chapter, đánh dấu pass/fail, **rà soát toàn truyện chỉ khi bấm nút** (có xác nhận). Không quét tự động nền.
- Docker admin không spawn quét (`STORY_PIPELINE_DISABLE_QA_SPAWN=1`) — copy lệnh CLI chạy trên host khi cần.

```bash
# Rà soát toàn truyện — chapter chưa audit / lỗi (user chạy thủ công)
viterbox/venv/bin/python scripts/story_pipeline/admin_pipeline_cli.py audit \
  --story-id <uuid> --only-needing-audit --json

# Phạm vi chapter
viterbox/venv/bin/python scripts/story_pipeline/admin_pipeline_cli.py audit \
  --story-id <uuid> --from-chapter 10 --to-chapter 50 --json
```

**Không** thêm worker QA tự chạy nền trong Docker.

```bash
# CLI trực tiếp (không cần admin UI)
viterbox/venv/bin/python scripts/story_pipeline/admin_pipeline_cli.py repolish \
  --story-id <uuid> --chapter-numbers 1,2,3 --json

# Hoặc qua Docker
docker compose --profile tools run --rm story-pipeline-cli repolish --story-id <uuid> --from-chapter 1 --to-chapter 50 --json
```

**Local dev** (`npm run dev` trong `story_admin/`): Python venv tại `../viterbox/venv` được dùng tự động.

**Docker story-admin**: mount repo tại `/repo`; set `STORY_PIPELINE_DOCKER=1` nếu container có quyền gọi `docker compose run story-pipeline-cli`.

Workers xử lý translate/polish: `docker compose --profile ai up -d`

## Scripts thủ công (`/operations`)

Chạy discovery/crawl từ UI — **async** với log lưu DB (`admin_pipeline_runs`):

| UI | Python script |
|---|---|
| Discovery | `discover_hot_stories.py` |
| Crawl batch | `crawl_stories_from_db.py` |
| Crawl một truyện | `crawl_stories_from_db.py --story-url ...` |

Migration: `story_db/postgres/init/021_admin_pipeline_runs.sql` (qua `story-db-migrate`).

```bash
# CLI trực tiếp
viterbox/venv/bin/python scripts/story_pipeline/admin_pipeline_cli.py discover --pages 2 --min-chapters 30 --json
viterbox/venv/bin/python scripts/story_pipeline/admin_pipeline_cli.py crawl-stories --only-incomplete --limit-stories 5 --json
viterbox/venv/bin/python scripts/story_pipeline/admin_pipeline_cli.py crawl-story --story-id <uuid> --json
```
