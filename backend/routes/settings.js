import { Router } from "express";
import { requireLogin } from "./auth.js";
import { getDailyGoalMinutes, setDailyGoalMinutes } from "../services/gamification.js";
import { getReadingDailyGoalMinutes, setReadingDailyGoalMinutes } from "../services/readingGamification.js";
import { getStorageProvider } from "../services/storage/index.js";

const router = Router();
router.use(requireLogin);

router.get("/", (req, res) => {
  res.json({
    dailyGoalMinutes: getDailyGoalMinutes(),
    readingDailyGoalMinutes: getReadingDailyGoalMinutes(),
    storageProvider: process.env.STORAGE_PROVIDER || "webdav",
    storageConfigured: getStorageProvider().isConfigured(),
    videoLibraryPath: process.env.NEXTCLOUD_VIDEO_LIBRARY_PATH || process.env.VIDEO_LIBRARY_PATH || "Lectures",
    booksLibraryPath: process.env.NEXTCLOUD_BOOKS_LIBRARY_PATH || process.env.BOOKS_LIBRARY_PATH || "Books",
  });
});

router.put("/", (req, res) => {
  if (req.body.dailyGoalMinutes !== undefined) {
    const minutes = Number(req.body.dailyGoalMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return res.status(400).json({ error: "Invalid dailyGoalMinutes" });
    }
    setDailyGoalMinutes(minutes);
  }
  if (req.body.readingDailyGoalMinutes !== undefined) {
    const minutes = Number(req.body.readingDailyGoalMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return res.status(400).json({ error: "Invalid readingDailyGoalMinutes" });
    }
    setReadingDailyGoalMinutes(minutes);
  }
  res.json({ ok: true });
});

export default router;
