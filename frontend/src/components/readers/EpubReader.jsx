import React, { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import { api } from "../../api.js";

const THEMES = {
  light: { background: "#f7f5f0", color: "#1a1a1a" },
  sepia: { background: "#f4ecd8", color: "#5b4636" },
  dark: { background: "#1c1f26", color: "#d8d8d8" },
};

// epub.js's themes.select() is meant to toggle multiple registered
// stylesheets' `disabled` flag, but in practice it doesn't reliably disable
// the previously-active one — both end up enabled and cascade order (not
// selection) decides which wins. themes.override() sets properties directly
// instead of juggling stylesheets, sidestepping that entirely.
function applyTheme(rendition, name) {
  const t = THEMES[name];
  rendition.themes.override("background", t.background, true);
  rendition.themes.override("color", t.color, true);
  rendition.themes.override("padding", "0 6%", true);
}

// epub.js's cover can be PNG/GIF/whatever the EPUB embeds — normalize to
// JPEG via canvas so it matches the format the backend cover endpoint expects.
function blobUrlToJpegDataUrl(blobUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 320;
      canvas.height = img.naturalHeight || 480;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = reject;
    img.src = blobUrl;
  });
}

export default function EpubReader({ book, heartbeat, initialCfi }) {
  const containerRef = useRef(null);
  const epubBookRef = useRef(null);
  const renditionRef = useRef(null);
  const [percent, setPercent] = useState(book.percent || 0);
  const [toc, setToc] = useState([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("lyceum.readerTheme") || "sepia");
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem("lyceum.readerFontSize")) || 100);
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem("lyceum.readerFont") || "serif");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(api.bookFileUrl(book.id), { credentials: "include" });
      const buf = await res.arrayBuffer();
      if (cancelled) return;

      const epubBook = ePub(buf);
      epubBookRef.current = epubBook;
      const rendition = epubBook.renderTo(containerRef.current, {
        width: "100%",
        height: "100%",
        flow: "scrolled-doc",
      });
      renditionRef.current = rendition;

      applyTheme(rendition, theme);
      rendition.themes.fontSize(`${fontSize}%`);
      rendition.themes.font(fontFamily === "serif" ? "Georgia, 'Times New Roman', serif" : "system-ui, sans-serif");

      await rendition.display(initialCfi || undefined);

      epubBook.loaded.navigation.then((nav) => {
        if (!cancelled) setToc(nav.toc || []);
      });

      if (!book.title_locked) {
        epubBook.loaded.metadata.then((meta) => {
          if (meta?.title || meta?.creator) {
            api.setBookMetadata(book.id, { title: meta.title || "", author: meta.creator || "" }).catch(() => {});
          }
        });
      }

      if (!book.cover_path) {
        epubBook
          .coverUrl()
          .then((url) => (url ? blobUrlToJpegDataUrl(url) : null))
          .then((dataUrl) => {
            if (dataUrl) api.setBookCover(book.id, dataUrl).catch(() => {});
          })
          .catch(() => {});
      }

      if (book.epub_locations_json) {
        epubBook.locations.load(book.epub_locations_json);
      } else {
        epubBook.ready
          .then(() => epubBook.locations.generate(1600))
          .then(() => {
            api.setEpubLocations(book.id, epubBook.locations.save()).catch(() => {});
          });
      }

      rendition.on("relocated", (location) => {
        const cfi = location.start.cfi;
        const pct = epubBook.locations.length() ? epubBook.locations.percentageFromCfi(cfi) : 0;
        setPercent(pct);
        heartbeat.reportPosition({ cfi, percent: pct }, { immediate: true });
      });

      rendition.on("keyup", handleKey);
    }

    function handleKey(e) {
      if (e.key === "ArrowRight") renditionRef.current?.next();
      if (e.key === "ArrowLeft") renditionRef.current?.prev();
      heartbeat.markActive();
    }
    window.addEventListener("keyup", handleKey);

    load();

    return () => {
      cancelled = true;
      window.removeEventListener("keyup", handleKey);
      renditionRef.current?.destroy?.();
      epubBookRef.current?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  useEffect(() => {
    if (renditionRef.current) applyTheme(renditionRef.current, theme);
    localStorage.setItem("lyceum.readerTheme", theme);
  }, [theme]);

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontSize}%`);
    localStorage.setItem("lyceum.readerFontSize", String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    renditionRef.current?.themes.font(fontFamily === "serif" ? "Georgia, 'Times New Roman', serif" : "system-ui, sans-serif");
    localStorage.setItem("lyceum.readerFont", fontFamily);
  }, [fontFamily]);

  function goToToc(href) {
    renditionRef.current?.display(href);
    setTocOpen(false);
    heartbeat.markActive();
  }

  return (
    <div className="epub-reader">
      <div className="reader-toolbar">
        <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => setTocOpen((o) => !o)}>
          Contents
        </button>
        <span>{Math.round(percent * 100)}%</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="reader-zoom">
            <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => setFontSize((s) => Math.max(s - 10, 70))}>
              A−
            </button>
            <span>{fontSize}%</span>
            <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => setFontSize((s) => Math.min(s + 10, 180))}>
              A+
            </button>
          </div>
          <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => setFontFamily((f) => (f === "serif" ? "sans" : "serif"))}>
            {fontFamily === "serif" ? "Serif" : "Sans"}
          </button>
          {Object.keys(THEMES).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              title={t}
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: theme === t ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: THEMES[t].background,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </div>
      <div className="epub-body">
        {tocOpen && (
          <div className="epub-toc">
            {toc.map((item) => (
              <button key={item.href} className="epub-toc-item" onClick={() => goToToc(item.href)}>
                {item.label.trim()}
              </button>
            ))}
          </div>
        )}
        <div className="epub-viewport" ref={containerRef} onScroll={() => heartbeat.markActive()} />
      </div>
    </div>
  );
}
