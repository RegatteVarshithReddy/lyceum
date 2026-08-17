import { Router } from "express";
import db from "../db.js";
import { scanLibrary } from "../services/libraryScan.js";
import { requireLogin } from "./auth.js";

const router = Router();
router.use(requireLogin);

router.post("/scan", async (req, res) => {
  try {
    const result = await scanLibrary();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Library scan failed:", err.message);
    res.status(502).json({ error: err.message });
  }
});

const listCoursesStmt = db.prepare(`
  SELECT
    c.id, c.title, c.path,
    COUNT(v.id) AS video_count,
    COALESCE(SUM(p.completed), 0) AS completed_count,
    (SELECT thumbnail_path FROM videos
       WHERE course_id = c.id AND archived_at IS NULL AND thumbnail_path IS NOT NULL
       ORDER BY sort_order LIMIT 1) AS cover_thumbnail
  FROM courses c
  LEFT JOIN videos v ON v.course_id = c.id AND v.archived_at IS NULL
  LEFT JOIN progress p ON p.video_id = v.id
  WHERE c.archived_at IS NULL
  GROUP BY c.id
  ORDER BY c.title COLLATE NOCASE
`);

router.get("/courses", (req, res) => {
  res.json(listCoursesStmt.all());
});

const getCourseStmt = db.prepare("SELECT * FROM courses WHERE id = ? AND archived_at IS NULL");
const listCourseVideosStmt = db.prepare(`
  SELECT v.*, p.position_seconds, p.completed, p.last_watched_at
  FROM videos v
  LEFT JOIN progress p ON p.video_id = v.id
  WHERE v.course_id = ? AND v.archived_at IS NULL
  ORDER BY v.sort_order
`);

router.get("/courses/:id", (req, res) => {
  const course = getCourseStmt.get(req.params.id);
  if (!course) return res.status(404).json({ error: "Not found" });
  res.json({ ...course, videos: listCourseVideosStmt.all(req.params.id) });
});

const markCourseWatchedStmt = db.prepare(`
  INSERT INTO progress (video_id, position_seconds, completed, last_watched_at, updated_at)
  SELECT v.id, COALESCE(v.duration_seconds, 0), 1, datetime('now'), datetime('now')
  FROM videos v WHERE v.course_id = ? AND v.archived_at IS NULL
  ON CONFLICT(video_id) DO UPDATE SET
    completed = 1,
    position_seconds = COALESCE((SELECT duration_seconds FROM videos WHERE id = progress.video_id), 0),
    last_watched_at = datetime('now'),
    updated_at = datetime('now')
`);

router.post("/courses/:id/mark-watched", (req, res) => {
  const course = getCourseStmt.get(req.params.id);
  if (!course) return res.status(404).json({ error: "Not found" });
  markCourseWatchedStmt.run(req.params.id);
  res.json({ ok: true });
});

const searchCoursesStmt = db.prepare(`
  SELECT id, title FROM courses
  WHERE archived_at IS NULL AND title LIKE ? ESCAPE '\\'
  ORDER BY title COLLATE NOCASE LIMIT 10
`);

const searchVideosStmt = db.prepare(`
  SELECT v.id, v.title, v.section, c.id AS course_id, c.title AS course_title
  FROM videos v
  JOIN courses c ON c.id = v.course_id AND c.archived_at IS NULL
  WHERE v.archived_at IS NULL AND v.title LIKE ? ESCAPE '\\'
  ORDER BY v.title COLLATE NOCASE
  LIMIT 30
`);

router.get("/search", (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ courses: [], videos: [] });

  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  res.json({
    courses: searchCoursesStmt.all(like),
    videos: searchVideosStmt.all(like),
  });
});

const randomUnwatchedStmt = db.prepare(`
  SELECT v.id FROM videos v
  LEFT JOIN progress p ON p.video_id = v.id
  WHERE v.archived_at IS NULL AND (p.completed IS NULL OR p.completed = 0)
  ORDER BY RANDOM() LIMIT 1
`);

router.get("/random-unwatched", (req, res) => {
  const row = randomUnwatchedStmt.get();
  if (!row) return res.status(404).json({ error: "Nothing unwatched left" });
  res.json({ videoId: row.id });
});

export default router;
