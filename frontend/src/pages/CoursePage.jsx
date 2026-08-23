import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api.js";
import { formatDuration } from "../utils.js";

function groupBySection(videos) {
  const groups = [];
  for (const v of videos) {
    const last = groups[groups.length - 1];
    if (last && last.section === v.section) {
      last.videos.push(v);
    } else {
      groups.push({ section: v.section, videos: [v] });
    }
  }
  return groups;
}

export default function CoursePage() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [marking, setMarking] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoryInput, setCategoryInput] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  useEffect(() => {
    setCourse(null);
    api.getCourse(courseId).then((c) => {
      setCourse(c);
      setCategoryInput(c.category || "");
    });
    api.listCategories().then(setCategories).catch(() => {});
  }, [courseId]);

  async function saveCategory() {
    const category = categoryInput.trim();
    if (category === (course.category || "")) return;
    setSavingCategory(true);
    try {
      const { category: saved } = await api.setCourseCategory(courseId, category);
      setCourse((c) => ({ ...c, category: saved }));
      setCategoryInput(saved || "");
    } finally {
      setSavingCategory(false);
    }
  }

  const groups = useMemo(() => (course ? groupBySection(course.videos) : []), [course]);

  async function toggleWatched(e, videoId) {
    e.preventDefault();
    e.stopPropagation();
    const { completed } = await api.markWatched(videoId);
    setCourse((c) => ({
      ...c,
      videos: c.videos.map((v) => (v.id === videoId ? { ...v, completed: completed ? 1 : 0 } : v)),
    }));
  }

  async function markAllWatched() {
    setMarking(true);
    try {
      await api.markCourseWatched(courseId);
      const fresh = await api.getCourse(courseId);
      setCourse(fresh);
    } finally {
      setMarking(false);
    }
  }

  if (!course) return <div className="empty-state">Loading…</div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Link to="/" className="btn-ghost" style={{ display: "inline-block", textDecoration: "none" }}>
          ← Library
        </Link>
        <button className="btn-ghost" onClick={markAllWatched} disabled={marking}>
          {marking ? "Marking…" : "Mark all watched"}
        </button>
      </div>
      <h1 className="page-title" style={{ marginBottom: 10 }}>{course.title}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <input
          className="category-input"
          list="category-options"
          placeholder="Uncategorized — click to set a category"
          value={categoryInput}
          onChange={(e) => setCategoryInput(e.target.value)}
          onBlur={saveCategory}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <datalist id="category-options">
          {categories.map((cat) => (
            <option key={cat} value={cat} />
          ))}
        </datalist>
        {savingCategory && <span style={{ color: "var(--text-dim)", fontSize: 12 }}>Saving…</span>}
      </div>
      {groups.map((group, i) => (
        <div key={i}>
          {group.section && <div className="section-heading" style={{ marginTop: i === 0 ? 0 : 28 }}>{group.section}</div>}
          <div className="video-list">
            {group.videos.map((v) => (
              <Link key={v.id} className="video-row" to={`/watch/${v.id}`}>
                {v.thumbnail_path ? (
                  <img className="video-row-thumb" src={`/api/thumbnails/${v.thumbnail_path}`} alt="" />
                ) : (
                  <div className="video-row-thumb" />
                )}
                <div className="video-row-title">{v.title}</div>
                <div style={{ color: "var(--text-dim)", fontSize: 13 }}>{formatDuration(v.duration_seconds)}</div>
                <button
                  className="btn-ghost"
                  style={{ padding: "4px 10px", fontSize: 12, flexShrink: 0 }}
                  onClick={(e) => toggleWatched(e, v.id)}
                >
                  {v.completed ? "✓ watched" : "Mark watched"}
                </button>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
