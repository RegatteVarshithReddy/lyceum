import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import CourseCard from "../components/CourseCard.jsx";

const UNCATEGORIZED = "Uncategorized";

export default function LibraryPage() {
  const [courses, setCourses] = useState(null);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [shuffling, setShuffling] = useState(false);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  function load() {
    api.listCourses().then(setCourses).catch((err) => setError(err.message));
    api.listCategories().then(setCategories).catch(() => {});
  }

  useEffect(load, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      api.search(query.trim()).then(setResults).catch(() => setResults({ courses: [], videos: [] }));
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  async function handleScan() {
    setScanning(true);
    setError("");
    try {
      await api.scanLibrary();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  async function handleSurpriseMe() {
    setShuffling(true);
    setError("");
    try {
      const { videoId } = await api.randomUnwatched();
      navigate(`/watch/${videoId}`);
    } catch {
      setError("No unwatched videos left — nice work.");
    } finally {
      setShuffling(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 16 }}>
        <h1 className="page-title" style={{ margin: 0, flexShrink: 0 }}>
          Your library
        </h1>
        <input
          type="text"
          placeholder="Search courses and videos…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            maxWidth: 420,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text)",
            padding: "9px 14px",
            fontSize: 14,
          }}
        />
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button className="btn-ghost" onClick={handleSurpriseMe} disabled={shuffling}>
            {shuffling ? "Picking…" : "🎲 Surprise me"}
          </button>
          <button className="btn-ghost" onClick={handleScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Rescan library"}
          </button>
        </div>
      </div>

      {error && <div style={{ color: "var(--danger)", marginBottom: 16 }}>{error}</div>}

      {results && (
        <div style={{ marginBottom: 32 }}>
          {results.courses.length === 0 && results.videos.length === 0 && (
            <div className="empty-state">No matches for "{query}".</div>
          )}
          {results.courses.length > 0 && (
            <>
              <div className="section-heading" style={{ marginTop: 0 }}>Courses</div>
              <div className="video-list" style={{ marginBottom: 20 }}>
                {results.courses.map((c) => (
                  <Link key={c.id} className="video-row" to={`/courses/${c.id}`}>
                    <div className="video-row-title">{c.title}</div>
                  </Link>
                ))}
              </div>
            </>
          )}
          {results.videos.length > 0 && (
            <>
              <div className="section-heading" style={{ marginTop: 0 }}>Videos</div>
              <div className="video-list">
                {results.videos.map((v) => (
                  <Link key={v.id} className="video-row" to={`/watch/${v.id}`}>
                    <div className="video-row-title">
                      {v.title}
                      <div style={{ color: "var(--text-dim)", fontWeight: 400, fontSize: 12 }}>
                        {v.course_title}{v.section ? ` · ${v.section}` : ""}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!results && courses === null && <div className="empty-state">Loading…</div>}

      {!results && courses && courses.length === 0 && (
        <div className="empty-state">
          No courses found yet. Make sure <code>NEXTCLOUD_VIDEO_LIBRARY_PATH</code> points at your course folders,
          then click "Rescan library".
        </div>
      )}

      {!results && courses && courses.length > 0 && categories.length > 0 && (
        <div className="category-filter-bar">
          {["All", ...categories, UNCATEGORIZED].map((cat) => (
            <button
              key={cat}
              className={`category-chip${activeCategory === cat ? " active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {!results && courses && courses.length > 0 && (
        <div className="course-grid">
          {courses
            .filter((c) => {
              if (activeCategory === "All") return true;
              if (activeCategory === UNCATEGORIZED) return !c.category;
              return c.category === activeCategory;
            })
            .map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
        </div>
      )}
    </>
  );
}
