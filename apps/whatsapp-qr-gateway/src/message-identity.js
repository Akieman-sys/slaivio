import { jidNormalizedUser } from "@whiskeysockets/baileys";

export const phoneFromJid = jid => {
  const value = jidNormalizedUser(String(jid || ""));
  if (!value.endsWith("@s.whatsapp.net") && !value.endsWith("@c.us")) return null;
  const digits = value.split("@")[0].split(":")[0].replace(/\D/g, "");
  return digits ? `+${digits}` : null;
};

export const resolveSenderIdentity = (key, isGroup, lidPhoneMap = new Map()) => {
  const technicalJid = jidNormalizedUser(String(
    (isGroup ? key.participantLid || key.senderLid || key.participant : key.senderLid || key.remoteJid) || "",
  ));
  const candidates = [
    isGroup ? key.participantPn : key.senderPn,
    key.remoteJidAlt,
    lidPhoneMap.get(technicalJid),
    isGroup ? key.participant : key.remoteJid,
  ].filter(Boolean).map(value => jidNormalizedUser(String(value)));
  const phoneJid = candidates.find(candidate => phoneFromJid(candidate));
  return { senderJid: technicalJid || phoneJid || null, phone: phoneFromJid(phoneJid) };
};
