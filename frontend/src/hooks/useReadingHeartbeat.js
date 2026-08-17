import { useEffect, useRef } from "react";
import { api } from "../api.js";

const HEARTBEAT_MS = 10000;
const IDLE_MS = 30000; // no interaction for 30s -> stop accruing reading time
const MAX_DELTA_SECONDS = 20;

// Video has a single "is this thing playing" signal. Reading doesn't, so
// "active" is inferred from recent page-turns/scrolling/keydowns and cleared
// after IDLE_MS of silence or when the tab loses visibility/focus.
export function useReadingHeartbeat(bookId) {
  const activeRef = useRef(false);
  const idleTimeoutRef = useRef(null);
  const lastFlushRef = useRef(Date.now());
  const positionRef = useRef(null);

  function flush({ immediate = false } = {}) {
    const pos = positionRef.current;
    if (!pos) return;

    if (immediate) {
      api.postBookProgress(bookId, { ...pos, seconds_delta: 0 }).catch(() => {});
      return;
    }

    const now = Date.now();
    const deltaSeconds = Math.min(Math.max((now - lastFlushRef.current) / 1000, 0), MAX_DELTA_SECONDS);
    lastFlushRef.current = now;
    if (!activeRef.current || deltaSeconds <= 0) return;
    api.postBookProgress(bookId, { ...pos, seconds_delta: deltaSeconds }).catch(() => {});
  }

  function markActive() {
    activeRef.current = true;
    clearTimeout(idleTimeoutRef.current);
    idleTimeoutRef.current = setTimeout(() => {
      activeRef.current = false;
    }, IDLE_MS);
  }

  function reportPosition(position, { immediate = false } = {}) {
    positionRef.current = position;
    markActive();
    if (immediate) flush({ immediate: true });
  }

  useEffect(() => {
    lastFlushRef.current = Date.now();
    const interval = setInterval(() => flush(), HEARTBEAT_MS);

    function handleVisibility() {
      if (document.hidden) {
        flush();
        activeRef.current = false;
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleVisibility);

    return () => {
      clearInterval(interval);
      flush();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleVisibility);
      clearTimeout(idleTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  return { reportPosition, markActive };
}
