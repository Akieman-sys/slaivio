import { signRequest } from "./signature.js";

export async function emitCallback(event) {
  const path = "/internal/whatsapp-qr/events";
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = process.env.WHATSAPP_QR_GATEWAY_SHARED_SECRET || "";
  const response = await fetch(`${(process.env.SLAIVIO_API_URL || "").replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-slaivio-timestamp": timestamp,
      "x-slaivio-signature": signRequest("POST", path, Buffer.from(body), timestamp, secret) },
    body,
  });
  if (!response.ok) throw new Error(`SLAIVIO callback failed (${response.status})`);
}
