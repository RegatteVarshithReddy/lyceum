import axios from "axios";
import { createClient } from "webdav";

// Generic WebDAV provider — works with plain WebDAV servers, and with
// Nextcloud/ownCloud's specific `/remote.php/dav/files/<user>/` convention
// when WEBDAV_NEXTCLOUD_MODE is on. Auto-detects Nextcloud mode when only
// the legacy NEXTCLOUD_URL var is set, so existing deployments configured
// before this became a generic provider need zero changes.

function config() {
  const url = process.env.WEBDAV_URL || process.env.NEXTCLOUD_URL;
  const username = process.env.WEBDAV_USERNAME || process.env.NEXTCLOUD_USERNAME;
  const password = process.env.WEBDAV_PASSWORD || process.env.NEXTCLOUD_APP_PASSWORD;
  const nextcloudMode =
    process.env.WEBDAV_NEXTCLOUD_MODE !== undefined
      ? process.env.WEBDAV_NEXTCLOUD_MODE === "true"
      : Boolean(process.env.NEXTCLOUD_URL);
  return { url, username, password, nextcloudMode };
}

export function isConfigured() {
  const { url, username, password } = config();
  return Boolean(url && username && password);
}

function requireConfigured() {
  if (!isConfigured()) {
    throw new Error("WebDAV storage is not configured (WEBDAV_* / NEXTCLOUD_* env vars missing)");
  }
}

function davRoot() {
  const { url, username, nextcloudMode } = config();
  if (!nextcloudMode) return url;
  return `${url}/remote.php/dav/files/${encodeURIComponent(username)}`;
}

// The `webdav` package parses PROPFIND XML and normalizes size/lastmod for
// us — used for directory listing/stat and (via getFileContents/
// putFileContents) for the small text-file read/write notes sync needs.
function davClient() {
  requireConfigured();
  const { username, password } = config();
  return createClient(davRoot(), { username, password });
}

// Raw axios client for the streaming proxy, which needs byte-exact control
// over forwarding Range and mirroring back 206/Content-Range — the `webdav`
// package's stream helpers fight that rather than helping.
function streamingClient() {
  requireConfigured();
  const { username, password } = config();
  return axios.create({
    baseURL: davRoot(),
    auth: { username, password },
    validateStatus: () => true,
    responseType: "stream",
  });
}

function davPath(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

export async function listDirectory(path, { deep = false } = {}) {
  const client = davClient();
  const entries = await client.getDirectoryContents(path, { deep });
  return entries.map((e) => ({
    name: e.basename,
    path: e.filename,
    type: e.type === "directory" ? "directory" : "file",
    size: e.size ?? null,
    mtime: e.lastmod ?? null,
  }));
}

export async function getFileStream(path, rangeHeader) {
  const client = streamingClient();
  const headers = {};
  if (rangeHeader) headers.Range = rangeHeader;

  const res = await client.get(davPath(path), { headers });
  if (res.status === 404) {
    res.data?.destroy?.();
    return { status: 404, headers: {}, stream: null };
  }
  if (res.status !== 200 && res.status !== 206) {
    res.data?.destroy?.();
    throw new Error(`WebDAV GET failed: HTTP ${res.status}`);
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
  const client = davClient();
  try {
    const content = await client.getFileContents(path, { format: "text" });
    return content;
  } catch (err) {
    if (err?.response?.status === 404 || err?.status === 404) return null;
    throw err;
  }
}

export async function putFileText(path, content, contentType = "text/plain") {
  const client = davClient();
  await client.putFileContents(path, content, { contentType, overwrite: true });
}

export async function ensureDirectory(path) {
  const client = davClient();
  try {
    await client.createDirectory(path, { recursive: true });
  } catch (err) {
    const status = err?.response?.status ?? err?.status;
    if (status !== 405 && status !== 409) throw err;
  }
}
