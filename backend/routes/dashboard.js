import { Router } from "express";
import db from "../db.js";
import { requireLogin } from "./auth.js";
import { computeStreak, totalHoursWatched, minutesWatchedToday, getDailyGoalMinutes } from "../services/gamification.js";
import {
  computeReadingStreak,
  totalHoursRead,
  minutesReadToday,
  getReadingDailyGoalMinutes,
} from "../services/readingGamification.js";

const router = Router();
router.use(requireLogin);

const recentActivityStmt = db.prepare(`
  SELECT date, SUM(seconds_watched) AS seconds_watched
  FROM activity_log
  WHERE date >= date('now', '-27 days')
  GROUP BY date
  ORDER BY date
`);

const badgesStmt = db.prepare("SELECT code, label, earned_at FROM badges ORDER BY earned_at DESC");

const continueWatchingStmt = db.prepare(`
  SELECT v.id, v.title, v.thumbnail_path, v.duration_seconds, c.title AS course_title,
    p.position_seconds, p.last_watched_at
  FROM progress p
  JOIN videos v ON v.id = p.video_id AND v.archived_at IS NULL
  JOIN courses c ON c.id = v.course_id AND c.archived_at IS NULL
  WHERE p.completed = 0 AND p.position_seconds > 0
  ORDER BY p.last_watched_at DESC
  LIMIT 8
`);

const courseBreakdownStmt = db.prepare(`
  SELECT c.id, c.title, SUM(a.seconds_watched) AS seconds_watched
  FROM activity_log a
  JOIN videos v ON v.id = a.video_id
  JOIN courses c ON c.id = v.course_id AND c.archived_at IS NULL
  GROUP BY c.id
  ORDER BY seconds_watched DESC
  LIMIT 8
`);

const readingActivityStmt = db.prepare(`
  SELECT date, SUM(seconds_read) AS seconds_read
  FROM book_activity_log
  WHERE date >= date('now', '-27 days')
  GROUP BY date
  ORDER BY date
`);

const currentlyReadingStmt = db.prepare(`
  SELECT b.id, b.title, b.author, b.cover_path, b.extension, p.percent, p.last_read_at
  FROM book_progress p
  JOIN books b ON b.id = p.book_id AND b.archived_at IS NULL
  WHERE p.status = 'reading'
  ORDER BY p.last_read_at DESC
  LIMIT 8
`);

router.get("/", (req, res) => {
  res.json({
    streak: computeStreak(),
    totalHoursWatched: totalHoursWatched(),
    minutesWatchedToday: minutesWatchedToday(),
    dailyGoalMinutes: getDailyGoalMinutes(),
    last28Days: recentActivityStmt.all(),
    badges: badgesStmt.all(),
    continueWatching: continueWatchingStmt.all(),
    courseBreakdown: courseBreakdownStmt.all(),

    readingStreak: computeReadingStreak(),
    totalHoursRead: totalHoursRead(),
    minutesReadToday: minutesReadToday(),
    readingDailyGoalMinutes: getReadingDailyGoalMinutes(),
    readingLast28Days: readingActivityStmt.all(),
    currentlyReading: currentlyReadingStmt.all(),
  });
});

export default router;
