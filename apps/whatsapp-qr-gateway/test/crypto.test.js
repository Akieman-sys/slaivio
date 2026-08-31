import test from "node:test";
import assert from "node:assert/strict";
import { decryptPayload, encryptPayload } from "../src/crypto.js";

test("session records are encrypted with authenticated encryption", () => {
  const key = Buffer.alloc(32, 7); const source = Buffer.from("private signal session");
  const encrypted = encryptPayload(source, key);
  assert.notDeepEqual(encrypted.encryptedPayload, source);
  assert.deepEqual(decryptPayload({ encrypted_payload: encrypted.encryptedPayload, nonce: encrypted.nonce, auth_tag: encrypted.authTag }, key), source);
});
