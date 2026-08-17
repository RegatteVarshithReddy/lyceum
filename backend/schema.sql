CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mtime TEXT NOT NULL,
  duration_seconds REAL,
  thumbnail_path TEXT,
  section TEXT,
  sort_order INTEGER NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_videos_course ON videos(course_id);

CREATE TABLE IF NOT EXISTS progress (
  video_id INTEGER PRIMARY KEY REFERENCES videos(id),
  position_seconds REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  last_watched_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  video_id INTEGER PRIMARY KEY REFERENCES videos(id),
  content_md TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT,
  dirty INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  video_id INTEGER NOT NULL REFERENCES videos(id),
  seconds_watched INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(date);

CREATE TABLE IF NOT EXISTS badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  earned_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author TEXT,
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mtime TEXT NOT NULL,
  cover_path TEXT,
  total_pages INTEGER,
  epub_locations_json TEXT,
  converted_epub_mtime TEXT,
  title_locked INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS book_progress (
  book_id INTEGER PRIMARY KEY REFERENCES books(id),
  percent REAL NOT NULL DEFAULT 0,
  page_number INTEGER,
  cfi TEXT,
  status TEXT NOT NULL DEFAULT 'unread',
  started_at TEXT,
  finished_at TEXT,
  last_read_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS book_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  book_id INTEGER NOT NULL REFERENCES books(id),
  seconds_read INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_book_activity_date ON book_activity_log(date);
