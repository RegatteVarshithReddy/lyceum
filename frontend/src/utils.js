// Deterministic gradient per course title, so posters without a captured
// thumbnail still look distinct instead of all sharing one fallback color.
const PALETTE = [
  ["#1c3b3a", "#16202c"],
  ["#3a2a4a", "#1c1626"],
  ["#1f3350", "#141b2a"],
  ["#3d2a1f", "#241811"],
  ["#233d2a", "#152418"],
  ["#3a1f33", "#221320"],
];

export function posterColors(title) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  const [a, b] = PALETTE[hash % PALETTE.length];
  return { "--poster-a": a, "--poster-b": b };
}

export function initials(title) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "--:--";
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
