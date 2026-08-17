import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api.js";
import { useReadingHeartbeat } from "../hooks/useReadingHeartbeat.js";
import PdfReader from "../components/readers/PdfReader.jsx";
import EpubReader from "../components/readers/EpubReader.jsx";

export default function BookReaderPage() {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const heartbeat = useReadingHeartbeat(bookId);

  useEffect(() => {
    setBook(null);
    api.getBook(bookId).then(setBook);
  }, [bookId]);

  async function toggleFinished() {
    const { status } = await api.markBookFinished(bookId);
    setBook((b) => ({ ...b, status }));
  }

  if (!book) return <div className="empty-state">Loading…</div>;

  return (
    <div className="reader-shell">
      <div className="reader-header">
        <Link to="/books" className="btn-ghost" style={{ textDecoration: "none" }}>
          ← Books
        </Link>
        <strong style={{ fontSize: 14 }}>{book.title}</strong>
        <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={toggleFinished}>
          {book.status === "finished" ? "✓ Finished" : "Mark finished"}
        </button>
      </div>
      {book.extension === "pdf" ? (
        <PdfReader book={book} heartbeat={heartbeat} initialPage={book.page_number} />
      ) : (
        <EpubReader book={book} heartbeat={heartbeat} initialCfi={book.cfi} />
      )}
    </div>
  );
}
