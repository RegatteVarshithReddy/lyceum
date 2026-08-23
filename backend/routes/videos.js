import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import db, { thumbnailsDir } from "../db.js";
import { getStorageProvider } from "../services/storage/index.js";
import { requireLogin } from "./auth.js";
import { COMPLETION_THRESHOLD, MIME_BY_EXT } from "../constants.js";
import { evaluateBadges } from "../services/gamification.js";
import { pushNoteToObsidian } from "../services/obsidianNotesSync.js";

const router = Router();
router.use(requireLogin);

const getVideoStmt = db.prepare(`
  SELECT v.*, c.title AS course_title, p.position_seconds, p.completed
  FROM videos v
  JOIN courses c ON c.id = v.course_id
  LEFT JOIN progress p ON p.video_id = v.id
  WHERE v.id = ? AND v.archived_at IS NULL
`);

router.get("/:id", (req, res) => {
  const video = getVideoStmt.get(req.params.id);
  if (!video) return res.status(404).json({ error: "Not found" });
  const note = db.prepare("SELECT content_md, synced_at, dirty FROM notes WHERE video_id = ?").get(req.params.id);
  res.json({ ...video, notes: note || { content_md: "", synced_at: null, dirty: 0 } });
});

router.get("/:id/stream", async (req, res) => {
  const video = db.prepare("SELECT * FROM videos WHERE id = ? AND archived_at IS NULL").get(req.params.id);
  if (!video) return res.status(404).end();

  let upstream;
  try {
    upstream = await getStorageProvider().getFileStream(video.path, req.headers.range);
  } catch (err) {
    console.error("Video stream request failed:", err.message);
    return res.status(502).end();
  }

  if (upstream.status === 404) return res.status(404).end();

  res.status(upstream.status);
  res.set("Accept-Ranges", "bytes");
  res.set("Content-Type", MIME_BY_EXT[video.extension] || "application/octet-stream");
  if (upstream.headers.contentLength) res.set("Content-Length", upstream.headers.contentLength);
  if (upstream.status === 206 && upstream.headers.contentRange) {
    res.set("Content-Range", upstream.headers.contentRange);
  }

  // Multi-GB course recordings occasionally have their upstream WebDAV
  // connection go silent mid-transfer (Nextcloud dropping it without an
  // error, likely a PHP execution-time limit on very large downloads)
  // instead of erroring or closing. Left alone, the response just hangs
  // forever and the <video> element sits stuck at whatever position it
  // stalled on. Destroying the stream after an idle gap lets the browser's
  // own retry/re-range logic pick the transfer back up.
  const STALL_TIMEOUT_MS = 15000;
  let stallTimer;
  const resetStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      console.error(`Video stream stalled (video ${video.id}), destroying upstream connection`);
      upstream.stream.destroy(new Error("Upstream stream stalled"));
    }, STALL_TIMEOUT_MS);
  };
  resetStallTimer();
  upstream.stream.on("data", resetStallTimer);
  upstream.stream.on("error", (err) => {
    clearTimeout(stallTimer);
    console.error("Video stream interrupted:", err.message);
    res.destroy();
  });
  upstream.stream.on("close", () => clearTimeout(stallTimer));

  req.on("close", () => {
    clearTimeout(stallTimer);
    upstream.stream.destroy();
  });
  upstream.stream.pipe(res);
});

router.put("/:id/duration", (req, res) => {
  const { duration_seconds } = req.body;
  if (!Number.isFinite(duration_seconds) || duration_seconds <= 0) {
    return res.status(400).json({ error: "Invalid duration_seconds" });
  }
  db.prepare("UPDATE videos SET duration_seconds = ?, updated_at = datetime('now') WHERE id = ?")
    .run(duration_seconds, req.params.id);
  res.json({ ok: true });
});

router.put("/:id/thumbnail", (req, res) => {
  const { data_url } = req.body;
  const match = /^data:image\/jpeg;base64,(.+)$/.exec(data_url || "");
  if (!match) return res.status(400).json({ error: "Expected a base64 JPEG data URL" });

  const filename = `${req.params.id}.jpg`;
  fs.writeFileSync(path.join(thumbnailsDir, filename), Buffer.from(match[1], "base64"));
  db.prepare("UPDATE videos SET thumbnail_path = ?, updated_at = datetime('now') WHERE id = ?")
    .run(filename, req.params.id);
  res.json({ ok: true, thumbnail_path: filename });
});

const upsertProgressStmt = db.prepare(`
  INSERT INTO progress (video_id, position_seconds, completed, last_watched_at, updated_at)
  VALUES (@video_id, @position_seconds, @completed, datetime('now'), datetime('now'))
  ON CONFLICT(video_id) DO UPDATE SET
    position_seconds = excluded.position_seconds,
    completed = excluded.completed,
    last_watched_at = datetime('now'),
    updated_at = datetime('now')
`);

const insertActivityStmt = db.prepare(`
  INSERT INTO activity_log (date, video_id, seconds_watched)
  VALUES (@date, @video_id, @seconds_watched)
`);

router.put("/:id/progress", (req, res) => {
  const video = db.prepare("SELECT * FROM videos WHERE id = ? AND archived_at IS NULL").get(req.params.id);
  if (!video) return res.status(404).json({ error: "Not found" });

  const positionSeconds = Number(req.body.position_seconds);
  const watchedDelta = Math.min(Math.max(Number(req.body.watched_delta) || 0, 0), 60);
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) {
    return res.status(400).json({ error: "Invalid position_seconds" });
  }

  const completed = video.duration_seconds
    ? positionSeconds >= COMPLETION_THRESHOLD * video.duration_seconds
      ? 1
      : 0
    : 0;

  upsertProgressStmt.run({ video_id: video.id, position_seconds: positionSeconds, completed });

  if (watchedDelta > 0) {
    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, container-local
    insertActivityStmt.run({ date: today, video_id: video.id, seconds_watched: Math.round(watchedDelta) });
  }

  const newBadges = evaluateBadges();
  res.json({ ok: true, completed: Boolean(completed), newBadges });
});

// Toggle: many of the 975 videos in a real library were watched long before
// Lyceum existed, and playing through each just to build up progress isn't
// realistic — this lets you fast-track that without touching duration.
router.post("/:id/mark-watched", (req, res) => {
  const video = db.prepare("SELECT * FROM videos WHERE id = ? AND archived_at IS NULL").get(req.params.id);
  if (!video) return res.status(404).json({ error: "Not found" });

  const current = db.prepare("SELECT completed FROM progress WHERE video_id = ?").get(video.id);
  const nextCompleted = current?.completed ? 0 : 1;
  const position = nextCompleted ? video.duration_seconds || 0 : 0;

  upsertProgressStmt.run({ video_id: video.id, position_seconds: position, completed: nextCompleted });
  const newBadges = evaluateBadges();
  res.json({ ok: true, completed: Boolean(nextCompleted), newBadges });
});

const upsertNoteStmt = db.prepare(`
  INSERT INTO notes (video_id, content_md, updated_at, dirty)
  VALUES (@video_id, @content_md, datetime('now'), 1)
  ON CONFLICT(video_id) DO UPDATE SET
    content_md = excluded.content_md,
    updated_at = datetime('now'),
    dirty = 1
`);

router.get("/:id/notes", (req, res) => {
  const note = db.prepare("SELECT * FROM notes WHERE video_id = ?").get(req.params.id);
  res.json(note || { video_id: Number(req.params.id), content_md: "", synced_at: null, dirty: 0 });
});

router.put("/:id/notes", (req, res) => {
  const contentMd = typeof req.body.content_md === "string" ? req.body.content_md : "";
  upsertNoteStmt.run({ video_id: req.params.id, content_md: contentMd });
  res.json({ ok: true });
});

router.post("/:id/notes/sync", async (req, res) => {
  const video = db.prepare(`
    SELECT v.title, c.title AS course_title FROM videos v
    JOIN courses c ON c.id = v.course_id
    WHERE v.id = ? AND v.archived_at IS NULL
  `).get(req.params.id);
  if (!video) return res.status(404).json({ error: "Not found" });

  const note = db.prepare("SELECT content_md FROM notes WHERE video_id = ?").get(req.params.id);
  const contentMd = note?.content_md || "";

  try {
    await pushNoteToObsidian({ courseTitle: video.course_title, videoTitle: video.title, contentMd });
    db.prepare("UPDATE notes SET synced_at = datetime('now'), dirty = 0 WHERE video_id = ?").run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("Obsidian notes sync failed:", err.message);
    res.status(502).json({ error: err.message });
  }
});

export default router;
