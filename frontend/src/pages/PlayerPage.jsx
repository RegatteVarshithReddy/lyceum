import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api.js";
import NotesPanel from "../components/NotesPanel.jsx";
import PomodoroTimer from "../components/PomodoroTimer.jsx";

const HEARTBEAT_MS = 10000;
const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
const SEEK_SECONDS = 10;

export default function PlayerPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState(null);
  const [courseVideos, setCourseVideos] = useState(null);
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem("lyceum.focusMode") === "1");
  const [speed, setSpeed] = useState(() => Number(localStorage.getItem("lyceum.playbackRate")) || 1);
  const [toast, setToast] = useState("");

  const videoRef = useRef(null);
  const lastPosRef = useRef(0);
  const playingRef = useRef(false);

  useEffect(() => {
    setVideo(null);
    setCourseVideos(null);
    api.getVideo(videoId).then((v) => {
      setVideo(v);
      lastPosRef.current = v.position_seconds || 0;
      api.getCourse(v.course_id).then((c) => setCourseVideos(c.videos));
    });
  }, [videoId]);

  useEffect(() => {
    localStorage.setItem("lyceum.focusMode", focusMode ? "1" : "0");
  }, [focusMode]);

  useEffect(() => {
    localStorage.setItem("lyceum.playbackRate", String(speed));
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  const nextVideo = (() => {
    if (!courseVideos) return null;
    const idx = courseVideos.findIndex((v) => v.id === Number(videoId));
    return idx >= 0 && idx < courseVideos.length - 1 ? courseVideos[idx + 1] : null;
  })();

  function reportProgress(finalFlush = false) {
    const el = videoRef.current;
    if (!el || !Number.isFinite(el.currentTime)) return;
    const now = el.currentTime;
    const delta = Math.max(now - lastPosRef.current, 0);
    lastPosRef.current = now;
    api
      .postProgress(videoId, now, delta)
      .then((res) => {
        if (res.newBadges?.length) {
          setToast(res.newBadges.map((b) => b.label).join(" · "));
          setTimeout(() => setToast(""), 4000);
        }
      })
      .catch(() => {});
    void finalFlush;
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (playingRef.current) reportProgress();
    }, HEARTBEAT_MS);
    return () => {
      clearInterval(id);
      reportProgress(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Keyboard shortcuts: space/k play-pause, arrows/j-l seek, n = next video.
  // Ignored while typing in the notes textarea (or any other input).
  useEffect(() => {
    function isTypingTarget(el) {
      return el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT");
    }

    function handleKeydown(e) {
      if (isTypingTarget(document.activeElement)) return;
      const el = videoRef.current;
      if (!el) return;

      if (e.code === "Space" || e.key === "k") {
        e.preventDefault();
        el.paused ? el.play() : el.pause();
      } else if (e.key === "ArrowRight" || e.key === "l") {
        el.currentTime = Math.min(el.currentTime + SEEK_SECONDS, el.duration || Infinity);
      } else if (e.key === "ArrowLeft" || e.key === "j") {
        el.currentTime = Math.max(el.currentTime - SEEK_SECONDS, 0);
      } else if (e.key === "n" && nextVideo) {
        navigate(`/watch/${nextVideo.id}`);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [nextVideo, navigate]);

  function handleLoadedMetadata() {
    const el = videoRef.current;
    if (!el || !video) return;
    el.playbackRate = speed;

    if (!video.duration_seconds) {
      api.setDuration(videoId, el.duration).catch(() => {});
    }

    if (video.position_seconds > 1 && video.position_seconds < el.duration - 1) {
      el.currentTime = video.position_seconds;
    } else if (!video.thumbnail_path) {
      captureThumbnail(el);
    }
  }

  function captureThumbnail(el) {
    const target = Math.min(el.duration * 0.1, Math.max(el.duration - 1, 0));
    const onSeeked = () => {
      el.removeEventListener("seeked", onSeeked);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = Math.round(320 * ((el.videoHeight || 9) / (el.videoWidth || 16)));
        canvas.getContext("2d").drawImage(el, 0, 0, canvas.width, canvas.height);
        api.setThumbnail(videoId, canvas.toDataURL("image/jpeg", 0.72)).catch(() => {});
      } catch {
        // canvas capture is best-effort
      }
      el.currentTime = 0;
    };
    el.addEventListener("seeked", onSeeked);
    el.currentTime = target;
  }

  function handleEnded() {
    playingRef.current = false;
    reportProgress();
    if (nextVideo) navigate(`/watch/${nextVideo.id}`);
  }

  if (!video) return <div className="empty-state">Loading…</div>;

  return (
    <div className={`player-layout ${focusMode ? "focus-mode" : ""}`}>
      <div>
        {!focusMode && (
          <Link to="/" className="btn-ghost" style={{ display: "inline-block", marginBottom: 14, textDecoration: "none" }}>
            ← Library
          </Link>
        )}
        <div className="video-shell">
          <video
            ref={videoRef}
            src={api.streamUrl(videoId)}
            controls
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => {
              playingRef.current = true;
            }}
            onPause={() => {
              playingRef.current = false;
              reportProgress();
            }}
            onEnded={handleEnded}
          />
        </div>
        <div className="player-toolbar">
          <div>
            <h1 className="player-title">{video.title}</h1>
            <p className="player-subtitle">{video.course_title}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className="btn-ghost"
                  style={{
                    padding: "4px 9px",
                    fontSize: 12,
                    borderColor: speed === s ? "var(--accent)" : undefined,
                    color: speed === s ? "var(--accent)" : undefined,
                  }}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
            {nextVideo && (
              <button className="btn-ghost" onClick={() => navigate(`/watch/${nextVideo.id}`)}>
                Next ▸
              </button>
            )}
            {focusMode && <PomodoroTimer />}
            <button className="btn-ghost" onClick={() => setFocusMode((f) => !f)}>
              {focusMode ? "Exit focus mode" : "Focus mode"}
            </button>
          </div>
        </div>
        {toast && (
          <div style={{ marginTop: 12, color: "var(--gold)", fontSize: 13, fontWeight: 600 }}>🏅 {toast}</div>
        )}
        {!focusMode && (
          <p style={{ marginTop: 10, color: "var(--text-dim)", fontSize: 12 }}>
            Shortcuts: space/k play·pause · ←/j back 10s · →/l forward 10s{nextVideo ? " · n next video" : ""}
          </p>
        )}
      </div>
      <NotesPanel videoId={videoId} />
    </div>
  );
}
