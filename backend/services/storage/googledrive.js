import { google } from "googleapis";
import { getToken, setToken } from "./oauthTokenStore.js";

// Google Drive provider. Drive is flat/ID-based, not path-based — every
// path the app uses has to be resolved to a folder/file ID by walking
// segments via files.list(). That resolution is cached in-process (not in
// SQLite — cheap to redo after a restart, not worth the persistence
// complexity for v1) so repeated calls during playback seeking don't each
// pay a multi-request resolution cost.
//
// Scope: drive.readonly, not the narrower drive.file. drive.file only sees
// files the app itself created or the user explicitly picked via a Google
// Picker UI — useless for scanning a pre-existing library the user
// organized before ever installing Lyceum. The tradeoff: unverified
// ("Testing" mode) OAuth apps using drive.readonly get a 7-day refresh
// token expiry from Google, since it's a sensitive scope. Most self-hosters
// registering their own OAuth app will hit this — see the README.

const CACHE_TTL_MS = 30 * 60 * 1000;
const idCache = new Map(); // path -> { id, isFolder, cachedAt }

export function isConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLEDRIVE_ROOT_FOLDER_ID &&
      getToken("googledrive")
  );
}

function requireConfigured() {
  if (!isConfigured()) {
    throw new Error("Google Drive is not configured/connected — visit Settings to connect it");
  }
}

export function oauthClient(redirectUri) {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);
}

function authedClient() {
  const token = getToken("googledrive");
  const client = oauthClient();
  client.setCredentials({ access_token: token.accessToken, refresh_token: token.refreshToken });
  client.on("tokens", (tokens) => {
    const current = getToken("googledrive") || {};
    setToken("googledrive", {
      accessToken: tokens.access_token || current.accessToken,
      refreshToken: tokens.refresh_token || current.refreshToken,
    });
  });
  return client;
}

function drive() {
  requireConfigured();
  return google.drive({ version: "v3", auth: authedClient() });
}

function cacheGet(path) {
  const entry = idCache.get(path);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    idCache.delete(path);
    return null;
  }
  return entry;
}

function cacheSet(path, id, isFolder) {
  idCache.set(path, { id, isFolder, cachedAt: Date.now() });
}

// Resolves an app path ("/Courses/Foo") to a Drive file/folder ID by
// walking one segment at a time from the configured root folder.
async function resolvePath(d, path) {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  if (!normalized) return { id: process.env.GOOGLEDRIVE_ROOT_FOLDER_ID, isFolder: true };

  const cached = cacheGet(normalized);
  if (cached) return cached;

  const segments = normalized.split("/");
  let parentId = process.env.GOOGLEDRIVE_ROOT_FOLDER_ID;
  let builtPath = "";
  let last = { id: parentId, isFolder: true };

  for (const segment of segments) {
    builtPath = builtPath ? `${builtPath}/${segment}` : segment;
    const alreadyCached = cacheGet(builtPath);
    if (alreadyCached) {
      last = alreadyCached;
      parentId = alreadyCached.id;
      continue;
    }

    const escaped = segment.replace(/'/g, "\\'");
    const res = await d.files.list({
      q: `'${parentId}' in parents and name = '${escaped}' and trashed = false`,
      fields: "files(id, mimeType)",
      pageSize: 1,
    });
    const file = res.data.files?.[0];
    if (!file) throw new NotFoundError(`Not found in Google Drive: ${builtPath}`);

    const isFolder = file.mimeType === "application/vnd.google-apps.folder";
    last = { id: file.id, isFolder };
    cacheSet(builtPath, file.id, isFolder);
    parentId = file.id;
  }

  return last;
}

class NotFoundError extends Error {}

export async function listDirectory(path, { deep = false } = {}) {
  const d = drive();
  const root = await resolvePath(d, path).catch((e) => {
    if (e instanceof NotFoundError) return null;
    throw e;
  });
  if (!root) return [];

  async function listOneLevel(folderId, currentPath) {
    const entries = [];
    let pageToken;
    do {
      const res = await d.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id, name, mimeType, size, modifiedTime), nextPageToken",
        pageSize: 1000,
        pageToken,
      });
      for (const file of res.data.files || []) {
        const isFolder = file.mimeType === "application/vnd.google-apps.folder";
        const entryPath = `${currentPath}/${file.name}`;
        cacheSet(entryPath.replace(/^\/+/, ""), file.id, isFolder);
        entries.push({
          name: file.name,
          path: entryPath,
          type: isFolder ? "directory" : "file",
          size: file.size != null ? Number(file.size) : null,
          mtime: file.modifiedTime || null,
        });
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    return entries;
  }

  const top = await listOneLevel(root.id, path.replace(/\/+$/, ""));
  if (!deep) return top;

  const all = [];
  const queue = top;
  while (queue.length) {
    const entry = queue.shift();
    if (entry.type === "directory") {
      const children = await listOneLevel((await resolvePath(d, entry.path)).id, entry.path);
      queue.push(...children);
    } else {
      all.push(entry);
    }
  }
  return all;
}

export async function getFileStream(path, rangeHeader) {
  const d = drive();
  let resolved;
  try {
    resolved = await resolvePath(d, path);
  } catch (e) {
    if (e instanceof NotFoundError) return { status: 404, headers: {}, stream: null };
    throw e;
  }

  const headers = {};
  if (rangeHeader) headers.Range = rangeHeader;

  try {
    const res = await d.files.get(
      { fileId: resolved.id, alt: "media" },
      { responseType: "stream", headers }
    );
    const status = rangeHeader && res.headers["content-range"] ? 206 : 200;
    return {
      status,
      headers: {
        contentLength: res.headers["content-length"],
        contentRange: res.headers["content-range"],
      },
      stream: res.data,
    };
  } catch (err) {
    if (err?.code === 404) {
      idCache.delete(path.replace(/^\/+|\/+$/g, "")); // self-heal: moved/renamed/deleted since last scan
      return { status: 404, headers: {}, stream: null };
    }
    throw err;
  }
}

export async function getFileText(path) {
  const result = await getFileStream(path);
  if (result.status === 404) return null;
  const chunks = [];
  for await (const chunk of result.stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function findOrCreateFolder(d, parentId, name) {
  const escaped = name.replace(/'/g, "\\'");
  const res = await d.files.list({
    q: `'${parentId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
  });
  if (res.data.files?.[0]) return res.data.files[0].id;

  const created = await d.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  });
  return created.data.id;
}

export async function ensureDirectory(path) {
  const d = drive();
  const segments = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  let parentId = process.env.GOOGLEDRIVE_ROOT_FOLDER_ID;
  let builtPath = "";
  for (const segment of segments) {
    builtPath = builtPath ? `${builtPath}/${segment}` : segment;
    const cached = cacheGet(builtPath);
    if (cached) {
      parentId = cached.id;
      continue;
    }
    parentId = await findOrCreateFolder(d, parentId, segment);
    cacheSet(builtPath, parentId, true);
  }
}

export async function putFileText(path, content, contentType = "text/plain") {
  const d = drive();
  const parentPath = path.replace(/\/[^/]+$/, "");
  const name = path.split("/").pop();

  await ensureDirectory(parentPath);
  const parent = await resolvePath(d, parentPath);

  const escaped = name.replace(/'/g, "\\'");
  const existing = await d.files.list({
    q: `'${parent.id}' in parents and name = '${escaped}' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
  });

  const media = { mimeType: contentType, body: content };
  if (existing.data.files?.[0]) {
    await d.files.update({ fileId: existing.data.files[0].id, media });
  } else {
    await d.files.create({ requestBody: { name, parents: [parent.id] }, media, fields: "id" });
  }
  idCache.delete(path.replace(/^\/+|\/+$/g, ""));
}
