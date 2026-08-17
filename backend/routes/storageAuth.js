import { Router } from "express";
import crypto from "node:crypto";
import { requireLogin } from "./auth.js";
import { getStorageProvider } from "../services/storage/index.js";
import { setToken, clearToken } from "../services/storage/oauthTokenStore.js";

const router = Router();

function redirectUri(provider, req) {
  const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  return `${base}/api/storage/${provider}/callback`;
}

router.get("/status", requireLogin, async (req, res) => {
  const storage = getStorageProvider();
  res.json({
    provider: process.env.STORAGE_PROVIDER || "webdav",
    connected: storage.isConfigured(),
  });
});

// --- Google Drive -----------------------------------------------------

router.get("/google", requireLogin, async (req, res) => {
  if (process.env.STORAGE_PROVIDER !== "googledrive") {
    return res.status(400).json({ error: "STORAGE_PROVIDER is not googledrive" });
  }
  const { oauthClient } = await import("../services/storage/googledrive.js");
  const state = crypto.randomBytes(16).toString("hex");
  req.session.storageOauthState = state;
  const client = oauthClient(redirectUri("google", req));
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive.readonly"],
    state,
  });
  res.redirect(url);
});

router.get("/google/callback", async (req, res) => {
  try {
    if (!req.query.state || req.query.state !== req.session.storageOauthState) {
      throw new Error("Invalid OAuth state — possible CSRF, or session expired mid-flow");
    }
    delete req.session.storageOauthState;

    const { oauthClient } = await import("../services/storage/googledrive.js");
    const client = oauthClient(redirectUri("google", req));
    const { tokens } = await client.getToken(req.query.code);
    setToken("googledrive", { accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
    res.redirect("/?connected=googledrive");
  } catch (err) {
    console.error("Google Drive OAuth callback failed:", err.message);
    res.redirect("/?error=googledrive_auth_failed");
  }
});

router.post("/google/disconnect", requireLogin, (req, res) => {
  clearToken("googledrive");
  res.json({ ok: true });
});

// --- Dropbox ------------------------------------------------------------

router.get("/dropbox", requireLogin, (req, res) => {
  if (process.env.STORAGE_PROVIDER !== "dropbox") {
    return res.status(400).json({ error: "STORAGE_PROVIDER is not dropbox" });
  }
  const state = crypto.randomBytes(16).toString("hex");
  req.session.storageOauthState = state;
  const params = new URLSearchParams({
    client_id: process.env.DROPBOX_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri("dropbox", req),
    token_access_type: "offline",
    state,
  });
  res.redirect(`https://www.dropbox.com/oauth2/authorize?${params}`);
});

router.get("/dropbox/callback", async (req, res) => {
  try {
    if (!req.query.state || req.query.state !== req.session.storageOauthState) {
      throw new Error("Invalid OAuth state — possible CSRF, or session expired mid-flow");
    }
    delete req.session.storageOauthState;

    const params = new URLSearchParams({
      code: req.query.code,
      grant_type: "authorization_code",
      client_id: process.env.DROPBOX_CLIENT_ID,
      client_secret: process.env.DROPBOX_CLIENT_SECRET,
      redirect_uri: redirectUri("dropbox", req),
    });
    const tokenRes = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!tokenRes.ok) throw new Error(`Dropbox token exchange failed: HTTP ${tokenRes.status}`);
    const data = await tokenRes.json();

    setToken("dropbox", {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });
    res.redirect("/?connected=dropbox");
  } catch (err) {
    console.error("Dropbox OAuth callback failed:", err.message);
    res.redirect("/?error=dropbox_auth_failed");
  }
});

router.post("/dropbox/disconnect", requireLogin, (req, res) => {
  clearToken("dropbox");
  res.json({ ok: true });
});

export default router;
