import "./env.js"; // must be the first local import — loads .env before anything reads process.env
import express from "express";
import session from "express-session";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "./db.js"; // opens/initializes the sqlite file + schema as a side effect
import { thumbnailsDir, coversDir } from "./db.js";
import authRoutes, { requireLogin } from "./routes/auth.js";
import libraryRoutes from "./routes/library.js";
import videoRoutes from "./routes/videos.js";
import dashboardRoutes from "./routes/dashboard.js";
import settingsRoutes from "./routes/settings.js";
import notesRoutes from "./routes/notes.js";
import booksRoutes from "./routes/books.js";
import storageAuthRoutes from "./routes/storageAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set("trust proxy", 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" })); // thumbnail data URLs are base64 JPEGs
app.use(
  session({
    name: "lyceum.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Set LYCEUM_COOKIE_SECURE=true in .env once this sits behind HTTPS.
      secure: process.env.LYCEUM_COOKIE_SECURE === "true",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  })
);

app.use("/auth", authRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/books", booksRoutes);
app.use("/api/storage", storageAuthRoutes);
app.use("/api/thumbnails", requireLogin, express.static(thumbnailsDir));
app.use("/api/covers", requireLogin, express.static(coversDir));

// Serve the built frontend (see root Dockerfile for the build step).
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/auth") || req.path.startsWith("/api")) return next();
  res.sendFile(path.join(publicDir, "index.html"));
});

const port = process.env.PORT || 4100;
app.listen(port, () => {
  console.log(`Lyceum listening on port ${port}`);
});
