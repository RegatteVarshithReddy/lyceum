import React, { useState } from "react";
import { Link } from "react-router-dom";
import { posterColors, initials } from "../utils.js";
import { api } from "../api.js";

const STATUS_LABEL = { unread: "Not started", reading: "Reading", finished: "Finished" };

export default function BookCard({ book, onTitleChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(book.title);
  const [saving, setSaving] = useState(false);
  const pct = Math.round((book.percent || 0) * 100);

  function startEdit(e) {
    e.preventDefault();
    e.stopPropagation();
    setDraft(book.title);
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await api.setBookMetadata(book.id, { title: draft.trim(), lock: true });
      onTitleChanged?.(book.id, draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel(e) {
    e.preventDefault();
    e.stopPropagation();
    setEditing(false);
  }

  return (
    <Link className="course-card" to={`/read/${book.id}`} style={{ position: "relative" }}>
      {book.cover_path ? (
        <img className="course-poster" src={`/api/covers/${book.cover_path}`} alt="" />
      ) : (
        <div className="course-poster-fallback" style={posterColors(book.title)}>
          {initials(book.title)}
        </div>
      )}
      {!editing && (
        <button
          onClick={startEdit}
          title="Edit title"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: "none",
            background: "rgba(16,20,26,0.75)",
            color: "var(--text)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          ✎
        </button>
      )}
      <div className="course-card-body">
        {editing ? (
          <div onClick={(e) => e.preventDefault()}>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{
                width: "100%",
                background: "var(--surface-raised)",
                border: "1px solid var(--accent)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                padding: "6px 8px",
                fontSize: 13,
                marginBottom: 8,
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-primary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={save} disabled={saving}>
                Save
              </button>
              <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={cancel}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="course-card-title">{book.title}</div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="course-card-meta">
              {STATUS_LABEL[book.status || "unread"]} · {book.extension.toUpperCase()}
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
