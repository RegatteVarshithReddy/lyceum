# Lyceum

A self-hosted, Netflix-style learning platform for the video courses and ebooks you already have — streamed straight from your own cloud storage, with real progress tracking, notes that sync to your Obsidian vault, gamification (streaks, badges, daily goals), and a distraction-free focus mode.

Nothing is uploaded anywhere new. Lyceum reads your existing library on whichever storage you already use (Nextcloud, ownCloud, S3-compatible storage, Google Drive, or Dropbox) and streams it on demand — no duplication, no lock-in.

## Features

- **Video library** — a course grid with progress bars, auto-generated section grouping for courses with chapters, search, keyboard shortcuts, playback speed control, and auto-play-next.
- **Book library** — PDF and EPUB reading with a real reader: continuous-scroll PDF with zoom, EPUB with font/theme (light/sepia/dark) controls and a table of contents. AZW3 support is on the roadmap (see [Known limitations](#known-limitations)).
- **Progress tracking** — per-video and per-book, with resume-where-you-left-off.
- **Notes** — a notes panel beside the player/reader, autosaved and pushed as markdown files into your Obsidian vault (or any folder on your storage), using a marker-section format that never clobbers content you add by hand around it.
- **Gamification** — separate watch and reading streaks, daily goals, rule-based badges, and a dashboard with a 28-day activity chart.
- **Focus mode** — a distraction-free player layout with an optional Pomodoro-style timer.
- **Multi-provider storage** — WebDAV (Nextcloud/ownCloud or a plain WebDAV server), S3-compatible storage (AWS S3, MinIO, Backblaze B2), Google Drive, or Dropbox. Pick one via a single env var.

## Quick start

**Prerequisites:** Docker and Docker Compose. That's it — everything else runs inside the container.

```bash
git clone https://github.com/RegatteVarshithReddy/lyceum.git
cd lyceum
cp .env.example .env
```

Edit `.env`:
1. Set `APP_PASSWORD` and `SESSION_SECRET` to something real.
2. Set `STORAGE_PROVIDER` to whichever you're using, and fill in that provider's block (see below for how to get credentials for each).
3. Set `VIDEO_LIBRARY_PATH` / `BOOKS_LIBRARY_PATH` to the folders in your storage that hold your courses and books.

```bash
docker compose up -d --build
```

Open `http://localhost:4100`, log in with `APP_PASSWORD`, and click **Rescan library** on the Library and Books pages.

### ⚠️ Before you expose this anywhere

Lyceum has **no per-user accounts, no rate limiting on the login page, and no HTTPS of its own** — it's a single shared password, designed for a personal instance sitting behind a VPN (Tailscale, WireGuard) or a reverse proxy that terminates TLS. Don't put it directly on the open internet as-is.

## Storage providers

Set `STORAGE_PROVIDER` in `.env` to one of `webdav`, `s3`, `googledrive`, `dropbox`, then fill in that provider's env block.

### WebDAV (Nextcloud / ownCloud / plain WebDAV)

The most common choice for self-hosted setups. In Nextcloud or ownCloud: **Settings → Security → Create new app password** — use that, not your account password.

```
WEBDAV_URL=https://your-nextcloud.example.com
WEBDAV_USERNAME=you
WEBDAV_PASSWORD=<app password>
WEBDAV_NEXTCLOUD_MODE=true   # false for a plain (non-Nextcloud/ownCloud) WebDAV server
```

### S3-compatible (AWS S3, MinIO, Backblaze B2, …)

No OAuth — just an access key. For MinIO/B2, set `S3_ENDPOINT` to your instance's URL and usually `S3_FORCE_PATH_STYLE=true`.

```
S3_BUCKET=my-library
S3_REGION=us-east-1
S3_ENDPOINT=              # leave blank for real AWS S3
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false
```

### Google Drive

You need to register your own OAuth app — Google doesn't allow a shared client for something like this:

1. [Google Cloud Console](https://console.cloud.google.com) → new project → **APIs & Services → Library** → enable the **Google Drive API**.
2. **APIs & Services → OAuth consent screen** → External → add yourself as a test user (fine to leave the app in "Testing" status for personal use).
3. **APIs & Services → Credentials** → Create OAuth client ID → type **Web application** → add redirect URI `<your PUBLIC_URL>/api/storage/google/callback`.
4. Copy the client ID/secret into `.env`, and set `GOOGLEDRIVE_ROOT_FOLDER_ID` to the ID from your library folder's Drive URL (`.../folders/<this part>`).
5. Start Lyceum, go to **Settings**, click **Connect Google Drive**.

**Heads up:** this uses the `drive.readonly` scope (needed to see a pre-existing library — the narrower `drive.file` scope can't). Google treats that as sensitive, so while your OAuth app is unverified ("Testing" status, which is fine for personal use), **the refresh token expires after 7 days** and you'll need to reconnect periodically. Full verification removes this but requires a Google security review — not worth it for personal use.

### Dropbox

1. [Dropbox App Console](https://www.dropbox.com/developers/apps) → Create app → **Scoped access**, **Full Dropbox** access (not "App folder" — same reasoning as Drive above, it needs to see your existing library).
2. Under **Permissions**, enable `files.metadata.read`, `files.content.read`, `files.content.write`.
3. Under **Settings**, add redirect URI `<your PUBLIC_URL>/api/storage/dropbox/callback`.
4. Copy the app key/secret into `.env` as `DROPBOX_CLIENT_ID`/`DROPBOX_CLIENT_SECRET`.
5. Start Lyceum, go to **Settings**, click **Connect Dropbox**.

## Architecture

- **Backend**: Node.js (Express), `better-sqlite3` for all app data (progress, notes, gamification — never your library files themselves). Single container, no separate database process.
- **Frontend**: React + Vite, built into the backend's static file directory — one container, one port.
- **Storage abstraction**: every provider implements the same small interface (`listDirectory`, `getFileStream`, `getFileText`, `putFileText`, `ensureDirectory`) in `backend/services/storage/`. Video/book streaming always forwards HTTP Range requests and pipes the response directly — nothing ever gets buffered fully in memory, regardless of provider or file size.
- **Readers**: `react-pdf` (PDF.js) for PDFs, `epubjs` for EPUB.

## Security notes

- OAuth tokens (Google Drive/Dropbox) are stored as plaintext JSON in the SQLite database (`backend/data/lyceum.db`), which is gitignored/dockerignored by default and never leaves your machine. Anyone who gets a copy of that file gets standing access to whatever cloud storage account is connected — back it up with the same care as any other credential.
- Both OAuth flows use a `state` parameter to prevent login-CSRF.
- Redirect URIs are validated by Google/Dropbox against your own registered app, per-deployment — there's no shared-app risk since every self-hoster registers their own client ID.

## Known limitations

- AZW3 (Kindle) ebook support is planned but not yet implemented — the conversion pipeline (via Calibre's `ebook-convert`, run server-side and cached) is designed but not built.
- Course-bundle detection (a folder containing several distinct courses rather than being one course itself) needs to be configured manually via `VIDEO_BUNDLE_FOLDERS` — there's no reliable way to auto-detect "this is a bundle" vs. "this is one course with chapters."
- Single shared password, no multi-user support — this is built for one person's personal library, not a shared/team deployment.

## License

MIT — see [LICENSE](LICENSE).
