import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { formatDuration } from "../utils.js";

export default function DashboardPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.dashboard().then(setData);
  }, []);

  if (!data) return <div className="empty-state">Loading…</div>;

  const goalPct = Math.min(Math.round((data.minutesWatchedToday / data.dailyGoalMinutes) * 100), 100);
  const maxDaySeconds = Math.max(...data.last28Days.map((d) => d.seconds_watched), 60);
  const readingGoalPct = Math.min(Math.round((data.minutesReadToday / data.readingDailyGoalMinutes) * 100), 100);
  const maxReadingDaySeconds = Math.max(...data.readingLast28Days.map((d) => d.seconds_read), 60);

  return (
    <>
      <h1 className="page-title">Dashboard</h1>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value">🔥 {data.streak}</div>
          <div className="label">day streak</div>
        </div>
        <div className="stat-tile">
          <div className="value">{Math.round(data.minutesWatchedToday)}m</div>
          <div className="label">today · {goalPct}% of {data.dailyGoalMinutes}m goal</div>
          <div className="progress-bar" style={{ marginTop: 10 }}>
            <div className="progress-bar-fill" style={{ width: `${goalPct}%` }} />
          </div>
        </div>
        <div className="stat-tile">
          <div className="value">
            {data.totalHoursWatched >= 1
              ? `${data.totalHoursWatched.toFixed(1)}h`
              : `${Math.round(data.totalHoursWatched * 60)}m`}
          </div>
          <div className="label">total watched</div>
        </div>
        <div className="stat-tile">
          <div className="value">{data.badges.length}</div>
          <div className="label">badges earned</div>
        </div>
      </div>

      <div className="section-heading">Last 28 days</div>
      <div className="activity-bars">
        {data.last28Days.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 13 }}>No activity yet.</div>}
        {data.last28Days.map((d) => (
          <div key={d.date} className="activity-bar" title={`${d.date}: ${Math.round(d.seconds_watched / 60)}m`}>
            <div
              className="activity-bar-fill"
              style={{ height: `${Math.max((d.seconds_watched / maxDaySeconds) * 100, 4)}%` }}
            />
          </div>
        ))}
      </div>

      {data.courseBreakdown.length > 0 && (
        <>
          <div className="section-heading">Time by course</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
            {(() => {
              const max = Math.max(...data.courseBreakdown.map((c) => c.seconds_watched));
              return data.courseBreakdown.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 220, fontSize: 13, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.title}
                  </div>
                  <div className="progress-bar" style={{ flex: 1 }}>
                    <div className="progress-bar-fill" style={{ width: `${(c.seconds_watched / max) * 100}%` }} />
                  </div>
                  <div style={{ width: 60, fontSize: 12, color: "var(--text-dim)", textAlign: "right", flexShrink: 0 }}>
                    {Math.round(c.seconds_watched / 60)}m
                  </div>
                </div>
              ));
            })()}
          </div>
        </>
      )}

      {data.continueWatching.length > 0 && (
        <>
          <div className="section-heading">Continue watching</div>
          <div className="video-list">
            {data.continueWatching.map((v) => (
              <Link key={v.id} className="video-row" to={`/watch/${v.id}`}>
                {v.thumbnail_path ? (
                  <img className="video-row-thumb" src={`/api/thumbnails/${v.thumbnail_path}`} alt="" />
                ) : (
                  <div className="video-row-thumb" />
                )}
                <div className="video-row-title">
                  {v.title}
                  <div style={{ color: "var(--text-dim)", fontWeight: 400, fontSize: 12 }}>{v.course_title}</div>
                </div>
                <div style={{ color: "var(--text-dim)", fontSize: 13 }}>
                  {formatDuration(v.position_seconds)} / {formatDuration(v.duration_seconds)}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {data.badges.length > 0 && (
        <>
          <div className="section-heading">Badges</div>
          <div className="badge-list">
            {data.badges.map((b) => (
              <div key={b.code} className="badge-chip">
                🏅 {b.label}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-heading" style={{ marginTop: 44, fontSize: 16, textTransform: "none", letterSpacing: 0, color: "var(--gold)" }}>
        📚 Reading
      </div>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--gold)" }}>🔥 {data.readingStreak}</div>
          <div className="label">day reading streak</div>
        </div>
        <div className="stat-tile">
          <div className="value">{Math.round(data.minutesReadToday)}m</div>
          <div className="label">
            today · {readingGoalPct}% of {data.readingDailyGoalMinutes}m goal
          </div>
          <div className="progress-bar" style={{ marginTop: 10 }}>
            <div className="progress-bar-fill" style={{ width: `${readingGoalPct}%`, background: "var(--gold)" }} />
          </div>
        </div>
        <div className="stat-tile">
          <div className="value">
            {data.totalHoursRead >= 1 ? `${data.totalHoursRead.toFixed(1)}h` : `${Math.round(data.totalHoursRead * 60)}m`}
          </div>
          <div className="label">total read</div>
        </div>
      </div>

      <div className="section-heading">Last 28 days</div>
      <div className="activity-bars">
        {data.readingLast28Days.length === 0 && (
          <div style={{ color: "var(--text-dim)", fontSize: 13 }}>No reading activity yet.</div>
        )}
        {data.readingLast28Days.map((d) => (
          <div key={d.date} className="activity-bar" title={`${d.date}: ${Math.round(d.seconds_read / 60)}m`}>
            <div
              className="activity-bar-fill"
              style={{ height: `${Math.max((d.seconds_read / maxReadingDaySeconds) * 100, 4)}%`, background: "var(--gold)" }}
            />
          </div>
        ))}
      </div>

      {data.currentlyReading.length > 0 && (
        <>
          <div className="section-heading">Currently reading</div>
          <div className="video-list">
            {data.currentlyReading.map((b) => (
              <Link key={b.id} className="video-row" to={`/read/${b.id}`}>
                {b.cover_path ? (
                  <img className="video-row-thumb" src={`/api/covers/${b.cover_path}`} alt="" />
                ) : (
                  <div className="video-row-thumb" />
                )}
                <div className="video-row-title">
                  {b.title}
                  <div style={{ color: "var(--text-dim)", fontWeight: 400, fontSize: 12 }}>{b.author}</div>
                </div>
                <div style={{ color: "var(--text-dim)", fontSize: 13 }}>{Math.round(b.percent * 100)}%</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
