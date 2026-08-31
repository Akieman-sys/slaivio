import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function signRequest(method, path, body, timestamp, secret) {
  const digest = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret).update(`${timestamp}\n${method.toUpperCase()}\n${path}\n${digest}`).digest("hex");
}

export function verifyRequest(method, path, body, timestamp, signature, secret, now = Date.now()) {
  if (!timestamp || !signature || !secret || Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;
  const expected = signRequest(method, path, body, timestamp, secret);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
