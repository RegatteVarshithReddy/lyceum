import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "lyceum.db");
const schemaPath = path.join(__dirname, "schema.sql");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "thumbnails"), { recursive: true });
fs.mkdirSync(path.join(dataDir, "covers"), { recursive: true });
fs.mkdirSync(path.join(dataDir, "converted"), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(fs.readFileSync(schemaPath, "utf8"));

// Lightweight column migrations for databases created before a column was
// added to schema.sql — CREATE TABLE IF NOT EXISTS doesn't retrofit existing
// tables. No formal migrations dir for a single-file personal app; this is
// the whole strategy.
function addColumnIfMissing(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!existing.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
addColumnIfMissing("videos", "section", "TEXT");
addColumnIfMissing("courses", "category", "TEXT");

export default db;
export const thumbnailsDir = path.join(dataDir, "thumbnails");
export const coversDir = path.join(dataDir, "covers");
export const convertedDir = path.join(dataDir, "converted");
