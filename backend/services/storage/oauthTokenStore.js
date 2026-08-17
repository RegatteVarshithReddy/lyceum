import db from "../../db.js";

// Shared token persistence for OAuth-based storage providers (Google Drive,
// Dropbox). Reuses the existing generic settings key-value table rather
// than adding a new one — JSON-serialized into a single row per provider.

export function getToken(provider) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(`storage_oauth_${provider}`);
  return row ? JSON.parse(row.value) : null;
}

export function setToken(provider, token) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(`storage_oauth_${provider}`, JSON.stringify(token));
}

export function clearToken(provider) {
  db.prepare("DELETE FROM settings WHERE key = ?").run(`storage_oauth_${provider}`);
}
