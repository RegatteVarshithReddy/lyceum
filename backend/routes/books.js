import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import db, { coversDir } from "../db.js";
import { scanBooks } from "../services/bookScan.js";
import { requireLogin } from "./auth.js";
import { getStorageProvider } from "../services/storage/index.js";
import { BOOK_MIME_BY_EXT } from "../constants.js";
import { evaluateBookBadges } from "../services/readingGamification.js";

const router = Router();
router.use(requireLogin);

router.post("/scan", async (req, res) => {
  try {
    const result = await scanBooks();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Book library scan failed:", err.message);
    res.status(502).json({ error: err.message });
  }
});

const listBooksStmt = db.prepare(`
  SELECT b.*, p.percent, p.status
  FROM books b
  LEFT JOIN book_progress p ON p.book_id = b.id
  WHERE b.archived_at IS NULL
  ORDER BY b.title COLLATE NOCASE
`);

router.get("/", (req, res) => {
  res.json(listBooksStmt.all());
});

const searchBooksStmt = db.prepare(`
  SELECT id, title, author, extension FROM books
  WHERE archived_at IS NULL AND (title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\')
  ORDER BY title COLLATE NOCASE
  LIMIT 30
`);

router.get("/search", (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  res.json(searchBooksStmt.all(like, like));
});

const getBookStmt = db.prepare(`
  SELECT b.*, p.percent, p.page_number, p.cfi, p.status, p.last_read_at
  FROM books b
  LEFT JOIN book_progress p ON p.book_id = b.id
  WHERE b.id = ? AND b.archived_at IS NULL
`);

router.get("/:id", (req, res) => {
  const book = getBookStmt.get(req.params.id);
  if (!book) return res.status(404).json({ error: "Not found" });
  res.json(book);
});

router.get("/:id/file", async (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ? AND archived_at IS NULL").get(req.params.id);
  if (!book) return res.status(404).end();

  if (book.extension === "azw3") {
    // Wired up in the Calibre conversion phase — not yet implemented.
    return res.status(501).json({ error: "AZW3 reading isn't wired up yet" });
  }

  let upstream;
  try {
    upstream = await getStorageProvider().getFileStream(book.path, req.headers.range);
  } catch (err) {
    console.error("Book file request failed:", err.message);
    return res.status(502).end();
  }

  if (upstream.status === 404) return res.status(404).end();

  res.status(upstream.status);
  res.set("Accept-Ranges", "bytes");
  res.set("Content-Type", BOOK_MIME_BY_EXT[book.extension] || "application/octet-stream");
  if (upstream.headers.contentLength) res.set("Content-Length", upstream.headers.contentLength);
  if (upstream.status === 206 && upstream.headers.contentRange) {
    res.set("Content-Range", upstream.headers.contentRange);
  }

  req.on("close", () => upstream.stream.destroy());
  upstream.stream.pipe(res);
});

const upsertBookProgressStmt = db.prepare(`
  INSERT INTO book_progress (book_id, percent, page_number, cfi, status, started_at, finished_at, last_read_at, updated_at)
  VALUES (@book_id, @percent, @page_number, @cfi, @status, @started_at, @finished_at, datetime('now'), datetime('now'))
  ON CONFLICT(book_id) DO UPDATE SET
    percent = excluded.percent,
    page_number = excluded.page_number,
    cfi = excluded.cfi,
    status = excluded.status,
    started_at = COALESCE(book_progress.started_at, excluded.started_at),
    finished_at = excluded.finished_at,
    last_read_at = datetime('now'),
    updated_at = datetime('now')
`);

const insertBookActivityStmt = db.prepare(`
  INSERT INTO book_activity_log (date, book_id, seconds_read)
  VALUES (@date, @book_id, @seconds_read)
`);

router.put("/:id/cover", (req, res) => {
  const { data_url } = req.body;
  const match = /^data:image\/jpeg;base64,(.+)$/.exec(data_url || "");
  if (!match) return res.status(400).json({ error: "Expected a base64 JPEG data URL" });

  const filename = `${req.params.id}.jpg`;
  fs.writeFileSync(path.join(coversDir, filename), Buffer.from(match[1], "base64"));
  db.prepare("UPDATE books SET cover_path = ?, updated_at = datetime('now') WHERE id = ?")
    .run(filename, req.params.id);
  res.json({ ok: true, cover_path: filename });
});

router.put("/:id/metadata", (req, res) => {
  const book = db.prepare("SELECT title_locked FROM books WHERE id = ?").get(req.params.id);
  if (!book) return res.status(404).json({ error: "Not found" });

  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const author = typeof req.body.author === "string" ? req.body.author.trim() : "";
  const lock = req.body.lock === true;

  if (book.title_locked && !lock) {
    // A manual edit is locking it right now, or it's already locked — either
    // way, lazy auto-capture must never clobber a locked title.
    return res.json({ ok: true, skipped: true });
  }

  db.prepare(`
    UPDATE books SET
      title = CASE WHEN ? != '' THEN ? ELSE title END,
      author = CASE WHEN ? != '' THEN ? ELSE author END,
      title_locked = CASE WHEN ? THEN 1 ELSE title_locked END,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(title, title, author, author, lock ? 1 : 0, req.params.id);

  res.json({ ok: true });
});

router.put("/:id/total-pages", (req, res) => {
  const totalPages = Number(req.body.total_pages);
  if (!Number.isFinite(totalPages) || totalPages <= 0) {
    return res.status(400).json({ error: "Invalid total_pages" });
  }
  db.prepare("UPDATE books SET total_pages = ?, updated_at = datetime('now') WHERE id = ?")
    .run(totalPages, req.params.id);
  res.json({ ok: true });
});

router.put("/:id/epub-locations", (req, res) => {
  const locations = req.body.locations;
  if (typeof locations !== "string" || !locations) {
    return res.status(400).json({ error: "Invalid locations" });
  }
  db.prepare("UPDATE books SET epub_locations_json = ?, updated_at = datetime('now') WHERE id = ?")
    .run(locations, req.params.id);
  res.json({ ok: true });
});

router.put("/:id/progress", (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ? AND archived_at IS NULL").get(req.params.id);
  if (!book) return res.status(404).json({ error: "Not found" });

  const pageNumber = Number.isFinite(req.body.page_number) ? req.body.page_number : null;
  const cfi = typeof req.body.cfi === "string" ? req.body.cfi : null;
  const secondsDelta = Math.min(Math.max(Number(req.body.seconds_delta) || 0, 0), 20);

  // PDF: page number is authoritative, percent is derived server-side (no
  // drift risk). EPUB/AZW3 has no server-side parser, so percent comes from
  // epub.js's own CFI-to-location calculation on the client.
  const percent =
    pageNumber && book.total_pages
      ? Math.min(Math.max(pageNumber / book.total_pages, 0), 1)
      : Math.min(Math.max(Number(req.body.percent) || 0, 0), 1);

  const status = percent >= 0.98 ? "finished" : percent > 0 ? "reading" : "unread";

  upsertBookProgressStmt.run({
    book_id: book.id,
    percent,
    page_number: pageNumber,
    cfi,
    status,
    started_at: new Date().toISOString(),
    finished_at: status === "finished" ? new Date().toISOString() : null,
  });

  if (secondsDelta > 0) {
    const today = new Date().toLocaleDateString("en-CA");
    insertBookActivityStmt.run({ date: today, book_id: book.id, seconds_read: Math.round(secondsDelta) });
  }

  const newBadges = evaluateBookBadges();
  res.json({ ok: true, status, newBadges });
});

router.post("/:id/mark-finished", (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ? AND archived_at IS NULL").get(req.params.id);
  if (!book) return res.status(404).json({ error: "Not found" });

  const current = db.prepare("SELECT status FROM book_progress WHERE book_id = ?").get(book.id);
  const nowFinished = current?.status !== "finished";

  upsertBookProgressStmt.run({
    book_id: book.id,
    percent: nowFinished ? 1 : 0,
    page_number: nowFinished ? book.total_pages : null,
    cfi: null,
    status: nowFinished ? "finished" : "unread",
    started_at: new Date().toISOString(),
    finished_at: nowFinished ? new Date().toISOString() : null,
  });

  const newBadges = nowFinished ? evaluateBookBadges() : [];
  res.json({ ok: true, status: nowFinished ? "finished" : "unread", newBadges });
});

export default router;
