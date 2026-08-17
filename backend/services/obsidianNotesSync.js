import { getStorageProvider } from "./storage/index.js";

const MARKER_START = "<!-- lyceum:notes:start -->";
const MARKER_END = "<!-- lyceum:notes:end -->";
const NOTES_HEADING = "## Notes";

function vaultPath() {
  return process.env.NEXTCLOUD_VAULT_PATH || process.env.NOTES_VAULT_PATH || "Obsidian/My Brain";
}

// Strip characters most storage providers/Obsidian can't safely handle in a
// path segment.
function sanitizeSegment(name) {
  return name.replace(/[/\\:*?"<>|]/g, "-").replace(/[.\s]+$/, "").trim();
}

function noteDirPath(courseTitle) {
  return `/${vaultPath()}/Learning Notes/${sanitizeSegment(courseTitle)}`;
}

function notePath(courseTitle, videoTitle) {
  return `${noteDirPath(courseTitle)}/${sanitizeSegment(videoTitle)}.md`;
}

function template(courseTitle, videoTitle) {
  return [
    "---",
    `course: ${courseTitle}`,
    `video: ${videoTitle}`,
    "source: lyceum",
    "---",
    "",
    NOTES_HEADING,
    "",
    MARKER_START,
    MARKER_END,
    "",
  ].join("\n");
}

function upsertNotesSection(content, notesMd) {
  const escapedStart = MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const markerRe = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`);
  const block = `${MARKER_START}\n${notesMd}\n${MARKER_END}`;

  if (markerRe.test(content)) {
    return content.replace(markerRe, block);
  }

  const headingIdx = content.indexOf(NOTES_HEADING);
  if (headingIdx !== -1) {
    const insertAt = headingIdx + NOTES_HEADING.length;
    return `${content.slice(0, insertAt)}\n\n${block}\n${content.slice(insertAt).replace(/^\n+/, "\n")}`;
  }

  const separator = content.endsWith("\n") ? "" : "\n";
  return `${content}${separator}\n${NOTES_HEADING}\n\n${block}\n`;
}

export async function pushNoteToObsidian({ courseTitle, videoTitle, contentMd }) {
  const storage = getStorageProvider();
  if (!storage.isConfigured()) {
    throw new Error("Storage provider is not configured — check your STORAGE_PROVIDER env vars");
  }

  // Some providers (WebDAV, Google Drive) 404 a write if the parent folders
  // don't already exist — no implicit mkdir -p, unlike a POSIX filesystem.
  // "Learning Notes/<Course>/" is new territory on first use, so this always
  // runs; it's a no-op for providers (S3, Dropbox) that auto-create parents.
  await storage.ensureDirectory(noteDirPath(courseTitle));

  const targetPath = notePath(courseTitle, videoTitle);
  const existing = await storage.getFileText(targetPath);
  const content = existing !== null ? existing : template(courseTitle, videoTitle);

  const updated = upsertNotesSection(content, contentMd);
  await storage.putFileText(targetPath, updated, "text/markdown");
}

export function isObsidianSyncConfigured() {
  return getStorageProvider().isConfigured();
}
