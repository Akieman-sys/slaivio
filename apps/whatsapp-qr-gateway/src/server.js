import express from "express";
import { getSession, logoutSession, rehydrateSessions, sendMessage, startSession } from "./session-manager.js";
import { verifyRequest } from "./signature.js";
import { pool } from "./db.js";

const secret = process.env.WHATSAPP_QR_GATEWAY_SHARED_SECRET || "";
if (!process.env.DATABASE_URL || !process.env.SLAIVIO_API_URL || secret.length < 32) throw new Error("Incomplete QR gateway configuration");

const app = express();
app.use(express.json({ limit: "256kb", verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});
app.use((req, res, next) => {
  const body = req.rawBody || Buffer.alloc(0);
  if (!verifyRequest(req.method, req.path, body, req.header("x-slaivio-timestamp"), req.header("x-slaivio-signature"), secret))
    return res.status(401).json({ error: "invalid_signature" });
  next();
});
app.post("/connections/:id/start", async (req, res, next) => { try { res.json(await startSession(req.params.id, req.body.org_id)); } catch (e) { next(e); } });
app.get("/connections/:id", (req, res) => { const state = getSession(req.params.id); res.status(state ? 200 : 404).json(state || { error: "session_not_loaded" }); });
app.post("/connections/:id/messages", async (req, res, next) => { try { res.json(await sendMessage(req.params.id, req.body.to, req.body.message)); } catch (e) { next(e); } });
app.post("/connections/:id/logout", async (req, res, next) => { try { res.json(await logoutSession(req.params.id)); } catch (e) { next(e); } });
app.use((error, _req, res, _next) => res.status(500).json({ error: String(error?.message || "gateway_error") }));
app.listen(Number(process.env.PORT || 8080), () => {
  rehydrateSessions().catch(error => console.error("session_rehydration_failed", error.message));
  // Reconcile persisted sessions regularly. This recovers automatically when
  // PostgreSQL or WhatsApp was unavailable during a gateway restart.
  const reconciliation = setInterval(() => {
    rehydrateSessions().catch(error => console.error("session_reconciliation_failed", error.message));
  }, 5 * 60 * 1000);
  reconciliation.unref();
});
