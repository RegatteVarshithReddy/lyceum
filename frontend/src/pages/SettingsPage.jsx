import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const OAUTH_PROVIDERS = { googledrive: "Google Drive", dropbox: "Dropbox" };

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [storageStatus, setStorageStatus] = useState(null);
  const [goal, setGoal] = useState(30);
  const [readingGoal, setReadingGoal] = useState(20);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setGoal(s.dailyGoalMinutes);
      setReadingGoal(s.readingDailyGoalMinutes);
    });
    api.storageStatus().then(setStorageStatus).catch(() => {});
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    await api.updateSettings({ dailyGoalMinutes: Number(goal), readingDailyGoalMinutes: Number(readingGoal) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDisconnect(provider) {
    await api.disconnectStorage(provider);
    setStorageStatus(await api.storageStatus());
  }

  if (!settings) return <div className="empty-state">Loading…</div>;

  const oauthLabel = OAUTH_PROVIDERS[settings.storageProvider];

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <form className="settings-card" onSubmit={handleSave}>
        <label htmlFor="goal">Daily watch goal (minutes)</label>
        <input id="goal" type="number" min="5" value={goal} onChange={(e) => setGoal(e.target.value)} />
        <label htmlFor="readingGoal">Daily reading goal (minutes)</label>
        <input id="readingGoal" type="number" min="5" value={readingGoal} onChange={(e) => setReadingGoal(e.target.value)} />
        <button className="btn-primary" type="submit">
          {saved ? "Saved ✓" : "Save"}
        </button>
      </form>

      <div className="section-heading">Storage</div>
      <div className="settings-card">
        <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--text-dim)" }}>
          Provider: <code>{settings.storageProvider}</code> · Status:{" "}
          {settings.storageConfigured ? "✓ configured" : "✗ not configured"}
        </p>
        <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text-dim)" }}>
          Video library path: <code>{settings.videoLibraryPath}</code>
        </p>
        <p style={{ margin: oauthLabel ? "0 0 16px" : 0, fontSize: 13, color: "var(--text-dim)" }}>
          Books library path: <code>{settings.booksLibraryPath}</code>
        </p>

        {oauthLabel && storageStatus && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            {storageStatus.connected ? (
              <button className="btn-ghost" onClick={() => handleDisconnect(settings.storageProvider)}>
                Disconnect {oauthLabel}
              </button>
            ) : (
              <a className="btn-primary" href={`/api/storage/${settings.storageProvider}`} style={{ textDecoration: "none", display: "inline-block" }}>
                Connect {oauthLabel}
              </a>
            )}
          </div>
        )}
      </div>
    </>
  );
}
