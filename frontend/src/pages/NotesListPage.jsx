import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

export default function NotesListPage() {
  const [notes, setNotes] = useState(null);

  useEffect(() => {
    api.listAllNotes().then(setNotes);
  }, []);

  if (!notes) return <div className="empty-state">Loading…</div>;

  return (
    <>
      <h1 className="page-title">My notes</h1>
      {notes.length === 0 && <div className="empty-state">No notes yet — they'll show up here as you take them.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {notes.map((n) => (
          <Link
            key={n.video_id}
            to={`/watch/${n.video_id}`}
            className="course-card"
            style={{ display: "block", padding: "16px 18px", textDecoration: "none" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <strong style={{ fontSize: 14 }}>{n.video_title}</strong>
              <span className={`notes-sync-status ${n.dirty ? "dirty" : "synced"}`}>
                {n.dirty ? "● Unsynced" : "✓ Synced"}
              </span>
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 10 }}>{n.course_title}</div>
            <div style={{ fontSize: 13.5, color: "var(--text)", whiteSpace: "pre-wrap", opacity: 0.85 }}>
              {n.content_md.length > 240 ? `${n.content_md.slice(0, 240)}…` : n.content_md}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
