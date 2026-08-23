const STORAGE_KEY = "lyceum-theme";

export function getTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

export function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
