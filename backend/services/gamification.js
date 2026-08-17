import db from "../db.js";
import { BADGE_STREAK_MILESTONES, BADGE_HOUR_MILESTONES } from "../constants.js";

function todayLocalISO() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, container-local
}

export function computeStreak() {
  const activeDates = new Set(
    db.prepare(`
      SELECT date FROM activity_log
      GROUP BY date
      HAVING SUM(seconds_watched) >= 60
    `).all().map((r) => r.date)
  );

  const cursor = new Date();
  if (!activeDates.has(todayLocalISO())) {
    cursor.setDate(cursor.getDate() - 1); // grace: today isn't over yet
  }

  let streak = 0;
  while (activeDates.has(cursor.toLocaleDateString("en-CA"))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function totalHoursWatched() {
  const row = db.prepare("SELECT COALESCE(SUM(seconds_watched), 0) AS total FROM activity_log").get();
  return row.total / 3600;
}

export function minutesWatchedToday() {
  const row = db.prepare("SELECT COALESCE(SUM(seconds_watched), 0) AS total FROM activity_log WHERE date = ?")
    .get(todayLocalISO());
  return row.total / 60;
}

const insertBadge = db.prepare(`INSERT OR IGNORE INTO badges (code, label) VALUES (?, ?)`);
const hasBadge = db.prepare(`SELECT 1 FROM badges WHERE code = ?`);

function awardIfMissing(code, label, earned) {
  if (!earned || hasBadge.get(code)) return null;
  insertBadge.run(code, label);
  return { code, label };
}

const coursesWithCompletionStmt = db.prepare(`
  SELECT c.id, c.title,
    COUNT(v.id) AS video_count,
    COALESCE(SUM(p.completed), 0) AS completed_count
  FROM courses c
  JOIN videos v ON v.course_id = c.id AND v.archived_at IS NULL
  LEFT JOIN progress p ON p.video_id = v.id
  WHERE c.archived_at IS NULL
  GROUP BY c.id
`);

export function evaluateBadges() {
  const newBadges = [];

  const anyCompleted = db.prepare("SELECT 1 FROM progress WHERE completed = 1 LIMIT 1").get();
  const first = awardIfMissing("first_video", "Watched your first video", Boolean(anyCompleted));
  if (first) newBadges.push(first);

  for (const course of coursesWithCompletionStmt.all()) {
    const complete = course.video_count > 0 && course.completed_count === course.video_count;
    const badge = awardIfMissing(
      `course_completed:${course.id}`,
      `Completed "${course.title}"`,
      complete
    );
    if (badge) newBadges.push(badge);
  }

  const streak = computeStreak();
  for (const milestone of BADGE_STREAK_MILESTONES) {
    const badge = awardIfMissing(`streak_${milestone}`, `${milestone}-day streak`, streak >= milestone);
    if (badge) newBadges.push(badge);
  }

  const hours = totalHoursWatched();
  for (const milestone of BADGE_HOUR_MILESTONES) {
    const badge = awardIfMissing(`hours_${milestone}`, `${milestone} hours watched`, hours >= milestone);
    if (badge) newBadges.push(badge);
  }

  return newBadges;
}

export function getDailyGoalMinutes() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'daily_goal_minutes'").get();
  return row ? Number(row.value) : 30;
}

export function setDailyGoalMinutes(minutes) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('daily_goal_minutes', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(minutes));
}
