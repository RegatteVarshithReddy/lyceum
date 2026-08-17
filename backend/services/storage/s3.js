import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

// S3-compatible provider — works for AWS S3 and any self-hosted
// S3-compatible target (MinIO, Backblaze B2, etc.) via a configurable
// endpoint. S3 has no real directories, only key prefixes — listDirectory
// fakes a folder view using ListObjectsV2's Delimiter/CommonPrefixes.

function config() {
  return {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    prefix: (process.env.S3_PREFIX || "").replace(/^\/+|\/+$/g, ""),
  };
}

export function isConfigured() {
  const c = config();
  return Boolean(c.bucket && c.accessKeyId && c.secretAccessKey);
}

function requireConfigured() {
  if (!isConfigured()) {
    throw new Error("S3 storage is not configured (S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY missing)");
  }
}

let cachedClient = null;
function client() {
  if (cachedClient) return cachedClient;
  const c = config();
  cachedClient = new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    forcePathStyle: c.forcePathStyle,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  return cachedClient;
}

// App-facing paths are POSIX-style with a leading slash, relative to the
// configured S3_PREFIX. Convert to/from real S3 keys at the edges only.
function toKey(appPath) {
  const { prefix } = config();
  const relative = appPath.replace(/^\/+/, "");
  return prefix ? `${prefix}/${relative}` : relative;
}

function toAppPath(key) {
  const { prefix } = config();
  const relative = prefix && key.startsWith(`${prefix}/`) ? key.slice(prefix.length + 1) : key;
  return `/${relative}`;
}

export async function listDirectory(path, { deep = false } = {}) {
  requireConfigured();
  const { bucket } = config();
  const prefix = toKey(path).replace(/\/?$/, "/").replace(/^\/+/, "");
  const s3 = client();

  const entries = [];
  let continuationToken;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: deep ? undefined : "/",
        ContinuationToken: continuationToken,
      })
    );

    for (const dir of res.CommonPrefixes || []) {
      const key = dir.Prefix.replace(/\/$/, "");
      entries.push({ name: key.split("/").pop(), path: toAppPath(key), type: "directory", size: null, mtime: null });
    }
    for (const obj of res.Contents || []) {
      if (obj.Key === prefix) continue; // zero-byte folder-marker object some tools create
      entries.push({
        name: obj.Key.split("/").pop(),
        path: toAppPath(obj.Key),
        type: "file",
        size: obj.Size ?? null,
        mtime: obj.LastModified ? obj.LastModified.toISOString() : null,
      });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return entries;
}

export async function getFileStream(path, rangeHeader) {
  requireConfigured();
  const { bucket } = config();
  try {
    const res = await client().send(
      new GetObjectCommand({ Bucket: bucket, Key: toKey(path), Range: rangeHeader || undefined })
    );
    const status = rangeHeader && res.ContentRange ? 206 : rangeHeader ? 206 : 200;
    return {
      status,
      headers: {
        contentLength: res.ContentLength != null ? String(res.ContentLength) : undefined,
        contentRange: res.ContentRange,
      },
      stream: res.Body,
    };
  } catch (err) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return { status: 404, headers: {}, stream: null };
    }
    throw err;
  }
}

export async function getFileText(path) {
  requireConfigured();
  const { bucket } = config();
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: bucket, Key: toKey(path) }));
    return await res.Body.transformToString();
  } catch (err) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function putFileText(path, content, contentType = "text/plain") {
  requireConfigured();
  const { bucket } = config();
  await client().send(
    new PutObjectCommand({ Bucket: bucket, Key: toKey(path), Body: content, ContentType: contentType })
  );
}

// S3 has no real folders — writing a key with slashes just works.
export async function ensureDirectory() {}
