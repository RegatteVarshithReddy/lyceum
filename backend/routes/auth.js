import { Router } from "express";

const router = Router();

// --- App-level login gate -------------------------------------------------
// Single-password gate since this instance is meant to live on your
// Tailscale network, not the open internet.

router.post("/login", (req, res) => {
  const { password } = req.body;
  if (password && password === process.env.APP_PASSWORD) {
    req.session.authed = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: "Wrong password" });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/session", (req, res) => {
  res.json({ authed: Boolean(req.session.authed) });
});

export function requireLogin(req, res, next) {
  if (req.session?.authed) return next();
  res.status(401).json({ error: "Not authenticated" });
}

export default router;
