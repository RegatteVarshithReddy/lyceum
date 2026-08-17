async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  session: () => request("/auth/session"),
  login: (password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request("/auth/logout", { method: "POST" }),

  scanLibrary: () => request("/api/library/scan", { method: "POST" }),
  listCourses: () => request("/api/library/courses"),
  getCourse: (id) => request(`/api/library/courses/${id}`),
  markCourseWatched: (id) => request(`/api/library/courses/${id}/mark-watched`, { method: "POST" }),
  search: (q) => request(`/api/library/search?q=${encodeURIComponent(q)}`),
  randomUnwatched: () => request("/api/library/random-unwatched"),

  getVideo: (id) => request(`/api/videos/${id}`),
  streamUrl: (id) => `/api/videos/${id}/stream`,
  setDuration: (id, duration_seconds) =>
    request(`/api/videos/${id}/duration`, { method: "PUT", body: JSON.stringify({ duration_seconds }) }),
  setThumbnail: (id, data_url) =>
    request(`/api/videos/${id}/thumbnail`, { method: "PUT", body: JSON.stringify({ data_url }) }),
  postProgress: (id, position_seconds, watched_delta) =>
    request(`/api/videos/${id}/progress`, {
      method: "PUT",
      body: JSON.stringify({ position_seconds, watched_delta }),
    }),
  markWatched: (id) => request(`/api/videos/${id}/mark-watched`, { method: "POST" }),

  getNotes: (id) => request(`/api/videos/${id}/notes`),
  saveNotes: (id, content_md) =>
    request(`/api/videos/${id}/notes`, { method: "PUT", body: JSON.stringify({ content_md }) }),
  syncNotes: (id) => request(`/api/videos/${id}/notes/sync`, { method: "POST" }),
  listAllNotes: () => request("/api/notes"),

  dashboard: () => request("/api/dashboard"),
  getSettings: () => request("/api/settings"),
  updateSettings: (settings) =>
    request("/api/settings", { method: "PUT", body: JSON.stringify(settings) }),

  storageStatus: () => request("/api/storage/status"),
  disconnectStorage: (provider) => request(`/api/storage/${provider}/disconnect`, { method: "POST" }),

  scanBooks: () => request("/api/books/scan", { method: "POST" }),
  listBooks: () => request("/api/books"),
  getBook: (id) => request(`/api/books/${id}`),
  searchBooks: (q) => request(`/api/books/search?q=${encodeURIComponent(q)}`),
  bookFileUrl: (id) => `/api/books/${id}/file`,
  setTotalPages: (id, total_pages) =>
    request(`/api/books/${id}/total-pages`, { method: "PUT", body: JSON.stringify({ total_pages }) }),
  setEpubLocations: (id, locations) =>
    request(`/api/books/${id}/epub-locations`, { method: "PUT", body: JSON.stringify({ locations }) }),
  setBookCover: (id, data_url) =>
    request(`/api/books/${id}/cover`, { method: "PUT", body: JSON.stringify({ data_url }) }),
  setBookMetadata: (id, { title, author, lock }) =>
    request(`/api/books/${id}/metadata`, { method: "PUT", body: JSON.stringify({ title, author, lock }) }),
  postBookProgress: (id, { percent, page_number, cfi, seconds_delta }) =>
    request(`/api/books/${id}/progress`, {
      method: "PUT",
      body: JSON.stringify({ percent, page_number, cfi, seconds_delta }),
    }),
  markBookFinished: (id) => request(`/api/books/${id}/mark-finished`, { method: "POST" }),
};
