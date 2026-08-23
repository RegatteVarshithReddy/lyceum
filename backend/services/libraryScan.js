import path from "node:path";
import db from "../db.js";
import { getStorageProvider } from "./storage/index.js";
import { VIDEO_EXTENSIONS } from "../constants.js";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function extensionOf(filename) {
  return path.extname(filename).slice(1).toLowerCase();
}

function humanize(folderName) {
  return folderName.replace(/[_-]+/g, " ").trim();
}

function parentFolderOf(filePath) {
  const idx = filePath.lastIndexOf("/");
  return idx === -1 ? "" : filePath.slice(0, idx);
}

// Real course exports use two different conventions and both show up in the
// same library: (a) several lessons directly in one chapter folder, each
// already meaningfully named ("Chapter_2/9 What are AI agents.mp4"), or
// (b) a downloader that gives every single lesson its own folder alongside
// a subtitle file, where the video itself is just an opaque id
// ("1. Course Intro/1. Course Structure - Outline Video/bqj0o53....mp4").
// Filenames alone can't distinguish these, but sibling count can: if this
// file is the only video in its immediate folder, that folder's name IS the
// lesson title; otherwise fall back to the filename. The UI groups videos by
// `section` (see sectionFor) instead of prefixing titles with folder
// context, so titles stay clean either way.
function titleFor(fileItem, siblingVideoCounts) {
  const base = path.basename(fileItem.name, path.extname(fileItem.name)).trim();
  const parent = parentFolderOf(fileItem.path);
  const parentName = parent.slice(parent.lastIndexOf("/") + 1);

  if (siblingVideoCounts.get(parent) === 1) {
    return humanize(parentName);
  }
  return base;
}

// The section a video belongs to, for grouping in the course page — the
// first path segment below the course root, e.g. "Chapter_2" or
// "1. Course Intro". Null when the video sits directly in the course root
// (flat course, no chapters/sections).
function sectionFor(coursePath, fileItem) {
  const relative = fileItem.path.slice(coursePath.length).replace(/^\/+/, "");
  const segments = relative.split("/");
  return segments.length <= 1 ? null : humanize(segments[0]);
}

const upsertCourse = db.prepare(`
  INSERT INTO courses (path, title, archived_at, updated_at)
  VALUES (@path, @title, NULL, datetime('now'))
  ON CONFLICT(path) DO UPDATE SET
    title = excluded.title,
    archived_at = NULL,
    updated_at = datetime('now')
`);

const getCourseIdByPath = db.prepare("SELECT id FROM courses WHERE path = ?");

const upsertVideo = db.prepare(`
  INSERT INTO videos (course_id, path, title, extension, size_bytes, mtime, section, sort_order, archived_at, updated_at)
  VALUES (@course_id, @path, @title, @extension, @size_bytes, @mtime, @section, @sort_order, NULL, datetime('now'))
  ON CONFLICT(path) DO UPDATE SET
    course_id = excluded.course_id,
    title = excluded.title,
    size_bytes = excluded.size_bytes,
    mtime = excluded.mtime,
    section = excluded.section,
    sort_order = excluded.sort_order,
    archived_at = NULL,
    updated_at = datetime('now')
`);

const archiveCoursesNotIn = db.prepare(`
  UPDATE courses SET archived_at = datetime('now'), updated_at = datetime('now')
  WHERE archived_at IS NULL AND id NOT IN (SELECT value FROM json_each(?))
`);

const archiveVideosNotIn = db.prepare(`
  UPDATE videos SET archived_at = datetime('now'), updated_at = datetime('now')
  WHERE archived_at IS NULL AND id NOT IN (SELECT value FROM json_each(?))
`);

const bundleFolderNames = new Set(
  (process.env.NEXTCLOUD_BUNDLE_FOLDERS || process.env.VIDEO_BUNDLE_FOLDERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

export async function scanLibrary() {
  const libraryRoot = process.env.NEXTCLOUD_VIDEO_LIBRARY_PATH || process.env.VIDEO_LIBRARY_PATH || "Lectures";
  const storage = getStorageProvider();

  const topLevel = await storage.listDirectory(libraryRoot, { deep: false });
  const topLevelDirs = topLevel
    .filter((item) => item.type === "directory")
    .sort((a, b) => collator.compare(a.name, b.name));

  // Standalone recordings sometimes get dropped straight into the library
  // root instead of their own course folder (e.g. a single long tutorial
  // video). They don't fit the "folder = course" model at all, so give each
  // one its own single-video course named after the file itself.
  const topLevelVideoFiles = topLevel.filter(
    (item) => item.type === "file" && VIDEO_EXTENSIONS.includes(extensionOf(item.name))
  );

  // Bundle folders (see VIDEO_BUNDLE_FOLDERS) hold several distinct courses
  // rather than being one course themselves — expand them one level so
  // their subfolders become the actual course list.
  const courseDirs = [];
  for (const dir of topLevelDirs) {
    if (!bundleFolderNames.has(dir.name)) {
      courseDirs.push(dir);
      continue;
    }
    const children = await storage.listDirectory(dir.path, { deep: false });
    courseDirs.push(
      ...children
        .filter((item) => item.type === "directory")
        .sort((a, b) => collator.compare(a.name, b.name))
    );
  }

  const seenCourseIds = [];
  const seenVideoIds = [];

  const getVideoIdByPath = db.prepare("SELECT id FROM videos WHERE path = ?");

  const applyLooseVideo = db.transaction((file) => {
    const title = humanize(path.basename(file.name, path.extname(file.name)));
    upsertCourse.run({ path: file.path, title });
    const courseId = getCourseIdByPath.get(file.path).id;
    seenCourseIds.push(courseId);

    upsertVideo.run({
      course_id: courseId,
      path: file.path,
      title,
      extension: extensionOf(file.name),
      size_bytes: file.size,
      mtime: file.mtime,
      section: null,
      sort_order: 0,
    });
    seenVideoIds.push(getVideoIdByPath.get(file.path).id);
  });

  const applyCourse = db.transaction((courseDir, videos, siblingVideoCounts) => {
    upsertCourse.run({ path: courseDir.path, title: courseDir.name });
    const courseId = getCourseIdByPath.get(courseDir.path).id;
    seenCourseIds.push(courseId);

    videos.forEach((file, index) => {
      upsertVideo.run({
        course_id: courseId,
        path: file.path,
        title: titleFor(file, siblingVideoCounts),
        extension: extensionOf(file.name),
        size_bytes: file.size,
        mtime: file.mtime,
        section: sectionFor(courseDir.path, file),
        sort_order: index,
      });
      seenVideoIds.push(getVideoIdByPath.get(file.path).id);
    });
  });

  for (const courseDir of courseDirs) {
    // deep: true walks any nesting depth — course folders sometimes hold
    // videos directly, sometimes under an extra module/chapter level, and
    // sometimes one-lesson-per-folder (see titleFor above).
    const entries = await storage.listDirectory(courseDir.path, { deep: true });
    const videoFiles = entries
      .filter((item) => item.type === "file" && VIDEO_EXTENSIONS.includes(extensionOf(item.name)))
      .sort((a, b) => collator.compare(a.path, b.path));

    const siblingVideoCounts = new Map();
    for (const file of videoFiles) {
      const parent = parentFolderOf(file.path);
      siblingVideoCounts.set(parent, (siblingVideoCounts.get(parent) || 0) + 1);
    }

    applyCourse(courseDir, videoFiles, siblingVideoCounts);
  }

  for (const file of topLevelVideoFiles) {
    applyLooseVideo(file);
  }

  archiveCoursesNotIn.run(JSON.stringify(seenCourseIds));
  archiveVideosNotIn.run(JSON.stringify(seenVideoIds));

  return {
    coursesScanned: seenCourseIds.length,
    videosScanned: seenVideoIds.length,
  };
}
