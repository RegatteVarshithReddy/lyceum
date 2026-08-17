import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const LOCAL_DEBOUNCE_MS = 2000;
const SYNC_DEBOUNCE_MS = 60000;

export default function NotesPanel({ videoId }) {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const localTimer = useRef(null);
  const syncTimer = useRef(null);
  const latestContent = useRef("");
  const dirtyRef = useRef(false);

  useEffect(() => {
    setLoaded(false);
    api.getNotes(videoId).then((note) => {
      setContent(note.content_md || "");
      latestContent.current = note.content_md || "";
      dirtyRef.current = Boolean(note.dirty);
      setDirty(dirtyRef.current);
      setSyncedAt(note.synced_at);
      setLoaded(true);
    });

    return () => {
      clearTimeout(localTimer.current);
      clearTimeout(syncTimer.current);
      // Flush unsynced notes to Obsidian on navigate-away / video change.
      if (dirtyRef.current) {
        api
          .saveNotes(videoId, latestContent.current)
          .then(() => api.syncNotes(videoId))
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  async function doSync() {
    setSyncing(true);
    try {
      await api.saveNotes(videoId, latestContent.current);
      await api.syncNotes(videoId);
      setSyncedAt(new Date().toISOString());
      dirtyRef.current = false;
      setDirty(false);
    } catch {
      // leave dirty; next edit or manual click retries
    } finally {
      setSyncing(false);
    }
  }

  function handleChange(e) {
    const value = e.target.value;
    setContent(value);
    latestContent.current = value;
    dirtyRef.current = true;
    setDirty(true);

    clearTimeout(localTimer.current);
    localTimer.current = setTimeout(() => {
      api.saveNotes(videoId, latestContent.current).catch(() => {});
    }, LOCAL_DEBOUNCE_MS);

    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(doSync, SYNC_DEBOUNCE_MS);
  }

  return (
    <div className="notes-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 14 }}>Notes</strong>
        <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={doSync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>
      <textarea
        placeholder="Notes for this video, pushed to your Obsidian vault…"
        value={content}
        onChange={handleChange}
        disabled={!loaded}
      />
      <div className={`notes-sync-status ${dirty ? "dirty" : "synced"}`}>
        {syncing ? "Syncing to Obsidian…" : dirty ? "● Unsynced changes" : syncedAt ? "✓ Synced to Obsidian" : "Not yet synced"}
      </div>
    </div>
  );
}
