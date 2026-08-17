import db from "../db.js";
import { READING_STREAK_MILESTONES, READING_HOUR_MILESTONES, BOOKS_READ_MILESTONES } from "../constants.js";

function todayLocalISO() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, container-local
}

export function computeReadingStreak() {
  const activeDates = new Set(
    db.prepare(`
      SELECT date FROM book_activity_log
      GROUP BY date
      HAVING SUM(seconds_read) >= 60
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

export function totalHoursRead() {
  const row = db.prepare("SELECT COALESCE(SUM(seconds_read), 0) AS total FROM book_activity_log").get();
  return row.total / 3600;
}

export function minutesReadToday() {
  const row = db.prepare("SELECT COALESCE(SUM(seconds_read), 0) AS total FROM book_activity_log WHERE date = ?")
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

export function evaluateBookBadges() {
  const newBadges = [];

  const finishedBooks = db.prepare(`
    SELECT b.id, b.title FROM book_progress p
    JOIN books b ON b.id = p.book_id
    WHERE p.status = 'finished'
  `).all();

  if (finishedBooks.length > 0) {
    const first = awardIfMissing("first_book", "Finished your first book", true);
    if (first) newBadges.push(first);
  }

  for (const book of finishedBooks) {
    const badge = awardIfMissing(`book_finished:${book.id}`, `Finished "${book.title}"`, true);
    if (badge) newBadges.push(badge);
  }

  for (const milestone of BOOKS_READ_MILESTONES) {
    const badge = awardIfMissing(
      `books_read_${milestone}`,
      `Finished ${milestone} books`,
      finishedBooks.length >= milestone
    );
    if (badge) newBadges.push(badge);
  }

  const streak = computeReadingStreak();
  for (const milestone of READING_STREAK_MILESTONES) {
    const badge = awardIfMissing(`reading_streak_${milestone}`, `${milestone}-day reading streak`, streak >= milestone);
    if (badge) newBadges.push(badge);
  }

  const hours = totalHoursRead();
  for (const milestone of READING_HOUR_MILESTONES) {
    const badge = awardIfMissing(`reading_hours_${milestone}`, `${milestone} hours read`, hours >= milestone);
    if (badge) newBadges.push(badge);
  }

  return newBadges;
}

export function getReadingDailyGoalMinutes() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'reading_daily_goal_minutes'").get();
  return row ? Number(row.value) : 20;
}

export function setReadingDailyGoalMinutes(minutes) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('reading_daily_goal_minutes', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(minutes));
}
