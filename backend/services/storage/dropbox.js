import axios from "axios";
import { getToken, setToken } from "./oauthTokenStore.js";

// Dropbox provider. Deliberately uses raw axios against Dropbox's HTTP API
// instead of the official `dropbox` npm package: that SDK's filesDownload()
// buffers the entire file into `result.fileBinary` rather than streaming
// (confirmed via Dropbox's own SDK issue tracker, with reports of it
// OOM-crashing on ~1GB files) — a direct violation of the no-buffering
// guarantee video/book playback depends on. Raw axios with
// responseType:"stream" avoids that entirely.

const API = "https://api.dropboxapi.com/2";
const CONTENT_API = "https://content.dropboxapi.com/2";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

export function isConfigured() {
  return Boolean(process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET && getToken("dropbox"));
}

function rootPath() {
  return (process.env.DROPBOX_ROOT_PATH || "").replace(/\/+$/, "");
}

// Dropbox wants "" for the account root and "/Folder/Sub" (leading slash,
// no trailing slash) for anything else — not the app's own leading-slash
// convention verbatim.
function toDropboxPath(appPath) {
  const relative = appPath.replace(/^\/+|\/+$/g, "");
  const full = [rootPath().replace(/^\/+/, ""), relative].filter(Boolean).join("/");
  return full ? `/${full}` : "";
}

function toAppPath(dropboxPath) {
  const root = rootPath();
  let p = dropboxPath;
  if (root && p.toLowerCase().startsWith(root.toLowerCase())) p = p.slice(root.length);
  return p.startsWith("/") ? p : `/${p}`;
}

// Access tokens are short-lived; refresh proactively using the stored
// refresh token rather than waiting for a 401, since a refresh mid-stream
// would be awkward to recover from cleanly.
async function getAccessToken() {
  const token = getToken("dropbox");
  if (!token) throw new Error("Dropbox is not connected — visit Settings to connect it");

  const expiresAt = token.expiresAt || 0;
  if (Date.now() < expiresAt - 60_000) return token.accessToken;

  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      client_id: process.env.DROPBOX_CLIENT_ID,
      client_secret: process.env.DROPBOX_CLIENT_SECRET,
    }),
    { validateStatus: () => true }
  );
  if (res.status !== 200) {
    throw new Error(`Dropbox token refresh failed (HTTP ${res.status}) — reconnect Dropbox in Settings`);
  }

  const updated = {
    accessToken: res.data.access_token,
    refreshToken: token.refreshToken,
    expiresAt: Date.now() + res.data.expires_in * 1000,
  };
  setToken("dropbox", updated);
  return updated.accessToken;
}

async function apiCall(path, body) {
  const accessToken = await getAccessToken();
  const res = await axios.post(`${API}${path}`, body, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    throw new Error(`Dropbox API ${path} failed: HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

function entryToStorageEntry(entry) {
  return {
    name: entry.name,
    path: toAppPath(entry.path_display),
    type: entry[".tag"] === "folder" ? "directory" : "file",
    size: entry[".tag"] === "file" ? entry.size : null,
    mtime: entry.server_modified || null,
  };
}

export async function listDirectory(path, { deep = false } = {}) {
  const dbxPath = toDropboxPath(path);
  let data = await apiCall("/files/list_folder", { path: dbxPath, recursive: deep });

  const entries = [...data.entries];
  while (data.has_more) {
    data = await apiCall("/files/list_folder/continue", { cursor: data.cursor });
    entries.push(...data.entries);
  }

  return entries.map(entryToStorageEntry);
}

export async function getFileStream(path, rangeHeader) {
  const accessToken = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Dropbox-API-Arg": JSON.stringify({ path: toDropboxPath(path) }),
  };
  if (rangeHeader) headers.Range = rangeHeader;

  const res = await axios.get(`${CONTENT_API}/files/download`, {
    headers,
    responseType: "stream",
    validateStatus: () => true,
  });

  if (res.status === 409) {
    res.data?.destroy?.();
    return { status: 404, headers: {}, stream: null }; // path/not_found comes back as 409 on this endpoint
  }
  if (res.status !== 200 && res.status !== 206) {
    res.data?.destroy?.();
    throw new Error(`Dropbox download failed: HTTP ${res.status}`);
  }

  return {
    status: res.status,
    headers: {
      contentLength: res.headers["content-length"],
      contentRange: res.headers["content-range"],
    },
    stream: res.data,
  };
}

export async function getFileText(path) {
  const result = await getFileStream(path);
  if (result.status === 404) return null;
  const chunks = [];
  for await (const chunk of result.stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export async function putFileText(path, content) {
  const accessToken = await getAccessToken();
  const res = await axios.post(`${CONTENT_API}/files/upload`, content, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path: toDropboxPath(path), mode: "overwrite" }),
      "Content-Type": "application/octet-stream",
    },
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    throw new Error(`Dropbox upload failed: HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
}

// Dropbox's upload endpoint auto-creates missing parent folders.
export async function ensureDirectory() {}
