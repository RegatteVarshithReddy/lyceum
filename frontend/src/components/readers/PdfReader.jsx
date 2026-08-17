import React, { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { api } from "../../api.js";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export default function PdfReader({ book, heartbeat, initialPage }) {
  const [numPages, setNumPages] = useState(book.total_pages || null);
  const [currentPage, setCurrentPage] = useState(initialPage || 1);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const scrolledToInitial = useRef(false);
  const pageOneCanvasRef = useRef(null);
  const file = useMemo(() => ({ url: api.bookFileUrl(book.id), withCredentials: true }), [book.id]);

  function onDocumentLoadSuccess(pdf) {
    setNumPages(pdf.numPages);
    if (book.total_pages !== pdf.numPages) {
      api.setTotalPages(book.id, pdf.numPages).catch(() => {});
    }
    if (!book.title_locked) {
      pdf.getMetadata().then(({ info }) => {
        if (info?.Title || info?.Author) {
          api.setBookMetadata(book.id, { title: info.Title || "", author: info.Author || "" }).catch(() => {});
        }
      }).catch(() => {});
    }
  }

  function capturePageOneCover() {
    const canvas = pageOneCanvasRef.current;
    if (!canvas || book.cover_path) return;
    try {
      api.setBookCover(book.id, canvas.toDataURL("image/jpeg", 0.72)).catch(() => {});
    } catch {
      // canvas capture is best-effort
    }
  }

  useEffect(() => {
    if (!numPages) return;
    // Pages are usually taller than the viewport, so a single 0.5 threshold
    // never crosses for any of them — track each page's last-known ratio
    // across every callback instead of requiring one element to dominate.
    const ratios = {};
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const page = Number(entry.target.dataset.pageNumber);
          ratios[page] = entry.isIntersecting ? entry.intersectionRatio : 0;
        });
        let bestPage = null;
        let bestRatio = 0;
        for (const [page, ratio] of Object.entries(ratios)) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPage = Number(page);
          }
        }
        if (bestPage) {
          setCurrentPage(bestPage);
          heartbeat.reportPosition({ page_number: bestPage }, { immediate: true });
        }
      },
      { threshold: Array.from({ length: 11 }, (_, i) => i / 10), root: containerRef.current }
    );
    Object.values(pageRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages]);

  useEffect(() => {
    if (scrolledToInitial.current || !numPages || !initialPage || initialPage <= 1) return;
    const el = pageRefs.current[initialPage];
    if (el) {
      el.scrollIntoView({ block: "start" });
      scrolledToInitial.current = true;
    }
  }, [numPages, initialPage]);

  function jumpPage(delta) {
    const target = Math.min(Math.max(currentPage + delta, 1), numPages || 1);
    const el = pageRefs.current[target];
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
    heartbeat.markActive();
  }

  useEffect(() => {
    function handleKeydown(e) {
      const el = document.activeElement;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) return;
      if (e.key === "PageDown" || e.key === "ArrowDown") {
        e.preventDefault();
        jumpPage(1);
      } else if (e.key === "PageUp" || e.key === "ArrowUp") {
        e.preventDefault();
        jumpPage(-1);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, numPages]);

  return (
    <div className="pdf-reader">
      <div className="reader-toolbar">
        <span>
          Page {currentPage} / {numPages || "…"}
        </span>
        <div className="reader-zoom">
          <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}>
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}>
            +
          </button>
        </div>
      </div>
      <div className="pdf-scroll" ref={containerRef} onScroll={() => heartbeat.markActive()}>
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="empty-state">Loading PDF…</div>}
        >
          {numPages &&
            Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <div key={n} data-page-number={n} ref={(el) => (pageRefs.current[n] = el)} className="pdf-page-wrap">
                <Page
                  pageNumber={n}
                  scale={zoom}
                  canvasRef={n === 1 ? pageOneCanvasRef : undefined}
                  onRenderSuccess={n === 1 ? capturePageOneCover : undefined}
                />
              </div>
            ))}
        </Document>
      </div>
    </div>
  );
}
