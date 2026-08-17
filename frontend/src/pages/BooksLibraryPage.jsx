import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import BookCard from "../components/BookCard.jsx";

export default function BooksLibraryPage() {
  const [books, setBooks] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const debounceRef = useRef(null);

  function load() {
    api.listBooks().then(setBooks).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      api.searchBooks(query.trim()).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  async function handleScan() {
    setScanning(true);
    setError("");
    try {
      await api.scanBooks();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  const shown = results !== null ? books?.filter((b) => results.some((r) => r.id === b.id)) : books;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 16 }}>
        <h1 className="page-title" style={{ margin: 0, flexShrink: 0 }}>
          Your books
        </h1>
        <input
          type="text"
          placeholder="Search books…"
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
        <button className="btn-ghost" onClick={handleScan} disabled={scanning}>
          {scanning ? "Scanning…" : "Rescan library"}
        </button>
      </div>

      {error && <div style={{ color: "var(--danger)", marginBottom: 16 }}>{error}</div>}

      {books === null && <div className="empty-state">Loading…</div>}

      {books && shown && shown.length === 0 && (
        <div className="empty-state">
          {results !== null
            ? `No matches for "${query}".`
            : <>No books found yet. Make sure <code>NEXTCLOUD_BOOKS_LIBRARY_PATH</code> points at your books folder, then click "Rescan library".</>}
        </div>
      )}

      {shown && shown.length > 0 && (
        <div className="course-grid">
          {shown.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              onTitleChanged={(id, title) =>
                setBooks((prev) => prev.map((book) => (book.id === id ? { ...book, title } : book)))
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
