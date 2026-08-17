import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import { api } from "./api.js";
import LibraryPage from "./pages/LibraryPage.jsx";
import CoursePage from "./pages/CoursePage.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import NotesListPage from "./pages/NotesListPage.jsx";
import BooksLibraryPage from "./pages/BooksLibraryPage.jsx";
import BookReaderPage from "./pages/BookReaderPage.jsx";

export default function App() {
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [streak, setStreak] = useState(0);
  const [readingStreak, setReadingStreak] = useState(0);
  const location = useLocation();

  useEffect(() => {
    api
      .session()
      .then((s) => setAuthed(s.authed))
      .finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    if (!authed) return;
    api.dashboard().then((d) => {
      setStreak(d.streak);
      setReadingStreak(d.readingStreak);
    }).catch(() => {});
  }, [authed, location.pathname]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    try {
      await api.login(password);
      setAuthed(true);
    } catch (err) {
      setLoginError(err.message);
    }
  }

  if (!checked) return null;

  if (!authed) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={handleLogin}>
          <h1>
            Lyceum<span style={{ color: "var(--accent)" }}>.</span>
          </h1>
          <p>Your library, streamed and self-hosted.</p>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {loginError && <div className="error">{loginError}</div>}
          <button className="btn-primary" type="submit">
            Enter
          </button>
        </form>
      </div>
    );
  }

  const isPlayerRoute = location.pathname.startsWith("/watch/") || location.pathname.startsWith("/read/");

  return (
    <div className="app-shell">
      {!isPlayerRoute && (
        <header className="app-header">
          <div className="brand">
            Lyceum<span className="dot">.</span>
          </div>
          <nav className="app-nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
              Library
            </NavLink>
            <NavLink to="/books" className={({ isActive }) => (isActive ? "active" : "")}>
              Books
            </NavLink>
            <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
              Dashboard
            </NavLink>
            <NavLink to="/notes" className={({ isActive }) => (isActive ? "active" : "")}>
              My Notes
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
              Settings
            </NavLink>
          </nav>
          <div className="header-right">
            {streak > 0 && <div className="streak-pill">🔥 {streak}-day streak</div>}
            {readingStreak > 0 && (
              <div className="streak-pill" style={{ background: "var(--gold-dim)", color: "var(--gold)" }}>
                📚 {readingStreak}-day streak
              </div>
            )}
            <button
              className="btn-ghost"
              onClick={async () => {
                await api.logout();
                setAuthed(false);
              }}
            >
              Log out
            </button>
          </div>
        </header>
      )}
      <div className="app-main" style={isPlayerRoute ? { maxWidth: "none", padding: "20px 24px" } : undefined}>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/courses/:courseId" element={<CoursePage />} />
          <Route path="/books" element={<BooksLibraryPage />} />
          <Route path="/read/:bookId" element={<BookReaderPage />} />
          <Route path="/watch/:videoId" element={<PlayerPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/notes" element={<NotesListPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </div>
  );
}
