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
const reconnectDelay = attempt => Math.min(60_000, 2_000 * (2 ** Math.min(attempt, 5)));

async function notify(session, eventType, payload = {}, suffix) {
  await emitCallback({ org_id: session.orgId, connection_id: session.id, event_type: eventType,
    event_key: eventKey(session.id, eventType, suffix), payload });
}

async function safeNotify(session, eventType, payload = {}, suffix) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { await notify(session, eventType, payload, suffix); return true; }
    catch (error) {
      logger.error({ error: error.message, connectionId: session.id, eventType, attempt: attempt + 1 }, "callback_failed");
      if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 1_000 * (2 ** attempt)));
    }
  }
  return false;
}

function clearReconnect(session) {
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  session.reconnectTimer = null;
}

function clearConnectionWatchdog(session) {
  if (session.connectionWatchdog) clearTimeout(session.connectionWatchdog);
  session.connectionWatchdog = null;
}

function scheduleReconnect(session) {
  if (session.intentionalLogout || session.reconnectTimer) return;
  const attempt = session.reconnectAttempts || 0;
  const delay = reconnectDelay(attempt);
  session.reconnectAttempts = attempt + 1;
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    startSession(session.id, session.orgId).catch(error => {
      logger.error({ error: error.message, connectionId: session.id }, "reconnect_failed");
      scheduleReconnect(session);
    });
  }, delay);
  logger.info({ connectionId: session.id, delay, attempt: attempt + 1 }, "reconnect_scheduled");
}

export async function startSession(id, orgId) {
  const current = sessions.get(id);
  if (current?.starting || ["CONNECTED", "QR_READY", "CONNECTING"].includes(current?.status)) return publicState(current);
  const session = current || { id, orgId, status: "CONNECTING", qrDataUrl: null, qrExpiresAt: null,
    socket: null, reconnectAttempts: 0, reconnectTimer: null, connectionWatchdog: null, intentionalLogout: false };
  session.orgId = orgId;
  session.starting = true;
  session.status = "CONNECTING";
  session.intentionalLogout = false;
  sessions.set(id, session);
  let auth;
  let socket;
  try {
    auth = await createPostgresAuthState(id);
    socket = makeWASocket({ auth: auth.state, printQRInTerminal: false, markOnlineOnConnect: false,
      syncFullHistory: false, generateHighQualityLinkPreview: false, logger: logger.child({ connectionId: id }),
      browser: ["SLAIVIO", "Chrome", "1.0.0"] });
  } catch (error) {
    session.starting = false;
    session.status = "DISCONNECTED";
    scheduleReconnect(session);
    throw error;
  }
  session.socket = socket;
  session.auth = auth;
  clearConnectionWatchdog(session);
  session.connectionWatchdog = setTimeout(() => {
    if (session.status !== "CONNECTING" || session.socket !== socket || session.intentionalLogout) return;
    logger.warn({ connectionId: id }, "connection_timeout");
    socket.end(new Error("connection_timeout"));
  }, 45_000);
  socket.ev.on("creds.update", auth.saveCreds);
  socket.ev.on("connection.update", async update => {
    try {
      if (update.qr) {
        clearConnectionWatchdog(session);
        session.status = "QR_READY";
        session.qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 320 });
        session.qrExpiresAt = new Date(Date.now() + 55_000).toISOString();
        await notify(session, "QR_READY", {}, String(Date.now()));
      }
      if (update.connection === "open") {
        clearConnectionWatchdog(session);
        clearReconnect(session);
        session.reconnectAttempts = 0;
        session.status = "CONNECTED"; session.qrDataUrl = null; session.qrExpiresAt = null;
        const jid = jidNormalizedUser(socket.user?.id || "");
        await safeNotify(session, "CONNECTED", { linked_jid: jid, phone_number: phoneFromJid(jid), verified_name: socket.user?.name || "WhatsApp lié" }, `${jid}:${Date.now()}`);
      }
      if (update.connection === "close") {
        clearConnectionWatchdog(session);
        const code = new Boom(update.lastDisconnect?.error).output.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        session.status = loggedOut ? "LOGGED_OUT" : "DISCONNECTED";
        // Reconnection must not depend on the API callback being available.
        if (loggedOut || session.intentionalLogout) {
          clearReconnect(session);
          await safeNotify(session, "LOGGED_OUT", { reason_code: code }, String(Date.now()));
          await auth.clear();
          sessions.delete(id);
        } else {
          scheduleReconnect(session);
          await safeNotify(session, "DISCONNECTED", { reason_code: code, reconnecting: true }, String(Date.now()));
        }
      }
    } catch (error) { logger.error({ error: error.message, connectionId: id }, "connection_update_failed"); }
  });
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const item of messages) {
      try {
        if (!item.message || item.key.fromMe || item.key.remoteJid === "status@broadcast") continue;
        const preferences = await pool.query(
          `select coalesce(number.auto_mark_read,false) auto_mark_read,
                  coalesce(number.group_replies_enabled,false) group_replies_enabled
           from whatsapp_qr_connections connection
           left join organization_whatsapp_numbers number on number.id=connection.whatsapp_number_id
           where connection.id=$1`, [session.id],
        );
        const preference = preferences.rows[0] || {};
        const isGroup = item.key.remoteJid?.endsWith("@g.us");
        if (isGroup && !preference.group_replies_enabled) {
          const managedGroup = await pool.query(
            `select 1 from dossiers where org_id=$1 and whatsapp_group_jid=$2 and archived_at is null limit 1`,
            [session.orgId, item.key.remoteJid],
          );
          if (!managedGroup.rowCount) continue;
        }
        const sourceJid = jidNormalizedUser(isGroup ? item.key.participant : (item.key.remoteJidAlt || item.key.remoteJid || ""));
        const text = textFromMessage(item.message);
        const messageType = Object.keys(item.message)[0]?.replace("Message", "") || "unknown";
        let groupName = null;
        if (isGroup) {
          try { groupName = (await socket.groupMetadata(item.key.remoteJid))?.subject || null; }
          catch (error) { logger.warn({ error: error.message, groupJid: item.key.remoteJid }, "group_metadata_unavailable"); }
        }
        if (preference.auto_mark_read) await socket.readMessages([item.key]);
        await notify(session, "MESSAGE_RECEIVED", { provider_message_id: item.key.id, from_phone: phoneFromJid(sourceJid),
          to_phone: phoneFromJid(socket.user?.id), text_body: text, message_type: messageType,
          group_jid: isGroup ? item.key.remoteJid : null,
          group_name: groupName,
          sender_name: item.pushName || null,
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
  const rawTarget = String(to || "").trim();
  const jid = rawTarget.endsWith("@g.us") ? rawTarget : `${rawTarget.replace(/\D/g, "")}@s.whatsapp.net`;
  const result = await session.socket.sendMessage(jid, { text: message });
  return { success: true, provider_message_id: result?.key?.id || null };
}

export async function createGroup(id, subject, participants) {
  const session = sessions.get(id);
  if (!session?.socket || session.status !== "CONNECTED") throw new Error("whatsapp_qr_session_not_connected");
  const jids = [...new Set((participants || []).map(phone => `${String(phone).replace(/\D/g, "")}@s.whatsapp.net`))];
  if (!String(subject || "").trim() || !jids.length) throw new Error("whatsapp_group_subject_and_participants_required");
  const result = await session.socket.groupCreate(String(subject).trim().slice(0, 100), jids);
  return { success: true, group_jid: result?.id || null, subject: result?.subject || subject };
}

export async function addGroupParticipants(id, groupJid, participants) {
  const session = sessions.get(id);
  if (!session?.socket || session.status !== "CONNECTED") throw new Error("whatsapp_qr_session_not_connected");
  const jids = [...new Set((participants || []).map(phone => `${String(phone).replace(/\D/g, "")}@s.whatsapp.net`))];
  if (!String(groupJid || "").endsWith("@g.us") || !jids.length) throw new Error("whatsapp_group_and_participants_required");
  const result = await session.socket.groupParticipantsUpdate(groupJid, jids, "add");
  return { success: true, results: result };
}

export async function logoutSession(id) {
  const session = sessions.get(id);
  if (session) { session.intentionalLogout = true; clearReconnect(session); clearConnectionWatchdog(session); }
  if (session?.socket) await session.socket.logout();
  if (session?.auth) await session.auth.clear();
  sessions.delete(id);
  return { status: "LOGGED_OUT" };
}
