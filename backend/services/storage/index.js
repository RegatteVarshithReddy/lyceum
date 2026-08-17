import * as webdav from "./webdav.js";

// s3/googledrive/dropbox are added in later phases; imported lazily here
// once they exist so an incomplete provider doesn't break `webdav`-only
// deployments during development.
let s3, googledrive, dropbox;
try {
  s3 = await import("./s3.js");
} catch {
  s3 = null;
}
try {
  googledrive = await import("./googledrive.js");
} catch {
  googledrive = null;
}
try {
  dropbox = await import("./dropbox.js");
} catch {
  dropbox = null;
}

const PROVIDERS = { webdav, s3, googledrive, dropbox };

export function getStorageProvider() {
  const name = process.env.STORAGE_PROVIDER || "webdav";
  const mod = PROVIDERS[name];
  if (!mod) {
    const available = Object.entries(PROVIDERS).filter(([, m]) => m).map(([k]) => k);
    throw new Error(`Unknown or unavailable STORAGE_PROVIDER "${name}". Available: ${available.join(", ")}`);
  }
  return mod;
}
