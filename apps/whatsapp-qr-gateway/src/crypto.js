import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function loadEncryptionKey(value = process.env.WHATSAPP_QR_SESSION_ENCRYPTION_KEY) {
  const key = Buffer.from(value || "", "base64");
  if (key.length !== 32) throw new Error("WHATSAPP_QR_SESSION_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return key;
}

export function encryptPayload(plaintext, key = loadEncryptionKey()) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encryptedPayload = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { encryptedPayload, nonce, authTag: cipher.getAuthTag() };
}

export function decryptPayload(record, key = loadEncryptionKey()) {
  const decipher = createDecipheriv("aes-256-gcm", key, record.nonce);
  decipher.setAuthTag(record.auth_tag);
  return Buffer.concat([decipher.update(record.encrypted_payload), decipher.final()]);
}
