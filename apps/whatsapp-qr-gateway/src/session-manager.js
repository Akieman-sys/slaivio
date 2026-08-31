import makeWASocket, { DisconnectReason, jidNormalizedUser } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";
import { createPostgresAuthState } from "./auth-store.js";
import { emitCallback } from "./callback.js";
import { pool } from "./db.js";

const sessions = new Map();
const logger = pino({ level: process.env.LOG_LEVEL || "info", redact: ["qr", "message", "payload"] });

const eventKey = (connectionId, type, suffix = crypto.randomUUID()) => `qr:${connectionId}:${type}:${suffix}`;
const phoneFromJid = jid => `+${String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "")}`;
const textFromMessage = message => message?.conversation || message?.extendedTextMessage?.text || message?.imageMessage?.caption || message?.videoMessage?.caption || message?.documentMessage?.caption || null;

async function notify(session, eventType, payload = {}, suffix) {
  await emitCallback({ org_id: session.orgId, connection_id: session.id, event_type: eventType,
    event_key: eventKey(session.id, eventType, suffix), payload });
}

export async function startSession(id, orgId) {
  const current = sessions.get(id);
  if (current?.starting || ["CONNECTED", "QR_READY", "CONNECTING"].includes(current?.status)) return publicState(current);
  const session = current || { id, orgId, status: "CONNECTING", qrDataUrl: null, qrExpiresAt: null, socket: null };
  session.orgId = orgId;
  session.starting = true;
  sessions.set(id, session);
  const auth = await createPostgresAuthState(id);
  const socket = makeWASocket({ auth: auth.state, printQRInTerminal: false, markOnlineOnConnect: false,
    syncFullHistory: false, generateHighQualityLinkPreview: false, logger: logger.child({ connectionId: id }),
    browser: ["SLAIVIO", "Chrome", "1.0.0"] });
  session.socket = socket;
  session.auth = auth;
  socket.ev.on("creds.update", auth.saveCreds);
  socket.ev.on("connection.update", async update => {
    try {
      if (update.qr) {
        session.status = "QR_READY";
        session.qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 320 });
        session.qrExpiresAt = new Date(Date.now() + 55_000).toISOString();
        await notify(session, "QR_READY", {}, String(Date.now()));
      }
      if (update.connection === "open") {
        session.status = "CONNECTED"; session.qrDataUrl = null; session.qrExpiresAt = null;
        const jid = jidNormalizedUser(socket.user?.id || "");
        await notify(session, "CONNECTED", { linked_jid: jid, phone_number: phoneFromJid(jid), verified_name: socket.user?.name || "WhatsApp lié" }, `${jid}:${Date.now()}`);
      }
      if (update.connection === "close") {
        const code = new Boom(update.lastDisconnect?.error).output.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        session.status = loggedOut ? "LOGGED_OUT" : "DISCONNECTED";
        await notify(session, session.status, { reason_code: code }, String(Date.now()));
        if (loggedOut) { await auth.clear(); sessions.delete(id); }
        else setTimeout(() => startSession(id, orgId).catch(error => logger.error({ error: error.message, connectionId: id }, "reconnect_failed")), 3000);
      }
    } catch (error) { logger.error({ error: error.message, connectionId: id }, "connection_update_failed"); }
  });
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const item of messages) {
      try {
        if (!item.message || item.key.fromMe || item.key.remoteJid === "status@broadcast" || item.key.remoteJid?.endsWith("@g.us")) continue;
        const sourceJid = jidNormalizedUser(item.key.remoteJidAlt || item.key.remoteJid || "");
        const text = textFromMessage(item.message);
        const messageType = Object.keys(item.message)[0]?.replace("Message", "") || "unknown";
        await notify(session, "MESSAGE_RECEIVED", { provider_message_id: item.key.id, from_phone: phoneFromJid(sourceJid),
          to_phone: phoneFromJid(socket.user?.id), text_body: text, message_type: messageType,
          received_at: new Date(Number(item.messageTimestamp || Date.now() / 1000) * 1000).toISOString() }, item.key.id);
      } catch (error) { logger.error({ error: error.message, connectionId: id }, "message_callback_failed"); }
    }
  });
  session.starting = false;
  return publicState(session);
}

export async function rehydrateSessions() {
  const result = await pool.query(
    `select id::text,org_id from whatsapp_qr_connections
     where status in ('CONNECTING','CONNECTED','DISCONNECTED') order by updated_at desc`,
  );
  for (const row of result.rows) {
    startSession(row.id, row.org_id).catch(error => logger.error({ error: error.message, connectionId: row.id }, "rehydration_failed"));
  }
  return result.rowCount;
}

export function publicState(session) {
  if (!session) return null;
  return { connection_id: session.id, status: session.status, qr_data_url: session.qrDataUrl, qr_expires_at: session.qrExpiresAt, gateway_reachable: true };
}

export function getSession(id) { return publicState(sessions.get(id)); }

export async function sendMessage(id, to, message) {
  const session = sessions.get(id);
  if (!session?.socket || session.status !== "CONNECTED") throw new Error("whatsapp_qr_session_not_connected");
  const jid = `${String(to).replace(/\D/g, "")}@s.whatsapp.net`;
  const result = await session.socket.sendMessage(jid, { text: message });
  return { success: true, provider_message_id: result?.key?.id || null };
}

export async function logoutSession(id) {
  const session = sessions.get(id);
  if (session?.socket) await session.socket.logout();
  if (session?.auth) await session.auth.clear();
  sessions.delete(id);
  return { status: "LOGGED_OUT" };
}
