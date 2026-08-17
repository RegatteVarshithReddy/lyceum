import path from "node:path";
import db from "../db.js";
import { getStorageProvider } from "./storage/index.js";
import { BOOK_EXTENSIONS } from "../constants.js";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function extensionOf(filename) {
  return path.extname(filename).slice(1).toLowerCase();
}

function titleFromFilename(filename) {
  return path.basename(filename, path.extname(filename)).trim();
}

// Unlike upsertVideo, this deliberately does NOT overwrite title/author/
// cover_path/title_locked on rescan — those get enriched lazily from the
// actual file (metadata + cover capture) and would otherwise be wiped back
// to the raw filename every time the library is rescanned.
const upsertBook = db.prepare(`
  INSERT INTO books (path, title, extension, size_bytes, mtime, archived_at, updated_at)
  VALUES (@path, @title, @extension, @size_bytes, @mtime, NULL, datetime('now'))
  ON CONFLICT(path) DO UPDATE SET
    extension = excluded.extension,
    size_bytes = excluded.size_bytes,
    mtime = excluded.mtime,
    archived_at = NULL,
    updated_at = datetime('now')
`);

const getBookIdByPath = db.prepare("SELECT id FROM books WHERE path = ?");

const archiveBooksNotIn = db.prepare(`
  UPDATE books SET archived_at = datetime('now'), updated_at = datetime('now')
  WHERE archived_at IS NULL AND id NOT IN (SELECT value FROM json_each(?))
`);

export async function scanBooks() {
  const libraryRoot = process.env.NEXTCLOUD_BOOKS_LIBRARY_PATH || process.env.BOOKS_LIBRARY_PATH || "Books";
  const storage = getStorageProvider();

  const entries = await storage.listDirectory(libraryRoot, { deep: false });
  const files = entries
    .filter((item) => item.type === "file" && BOOK_EXTENSIONS.includes(extensionOf(item.name)))
    .sort((a, b) => collator.compare(a.name, b.name));

  const seenBookIds = [];

  const apply = db.transaction(() => {
    for (const file of files) {
      upsertBook.run({
        path: file.path,
        title: titleFromFilename(file.name),
        extension: extensionOf(file.name),
        size_bytes: file.size,
        mtime: file.mtime,
      });
      seenBookIds.push(getBookIdByPath.get(file.path).id);
    }
  });
  apply();

  archiveBooksNotIn.run(JSON.stringify(seenBookIds));

  return { booksScanned: seenBookIds.length };
}
