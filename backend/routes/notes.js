import { Router } from "express";
import db from "../db.js";
import { requireLogin } from "./auth.js";

const router = Router();
router.use(requireLogin);

const listNotesStmt = db.prepare(`
  SELECT n.video_id, n.content_md, n.updated_at, n.synced_at, n.dirty,
    v.title AS video_title, c.id AS course_id, c.title AS course_title
  FROM notes n
  JOIN videos v ON v.id = n.video_id AND v.archived_at IS NULL
  JOIN courses c ON c.id = v.course_id AND c.archived_at IS NULL
  WHERE TRIM(n.content_md) != ''
  ORDER BY n.updated_at DESC
`);

router.get("/", (req, res) => {
  res.json(listNotesStmt.all());
});

export default router;
