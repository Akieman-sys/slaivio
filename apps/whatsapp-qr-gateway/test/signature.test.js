import test from "node:test";
import assert from "node:assert/strict";
import { signRequest, verifyRequest } from "../src/signature.js";

test("signed gateway requests are accepted once and tampering is rejected", () => {
  const secret = "a".repeat(32); const timestamp = "1700000000"; const body = Buffer.from('{"ok":true}');
  const signature = signRequest("POST", "/connections/x/start", body, timestamp, secret);
  assert.equal(verifyRequest("POST", "/connections/x/start", body, timestamp, signature, secret, 1700000000000), true);
  assert.equal(verifyRequest("POST", "/connections/x/start", Buffer.from("changed"), timestamp, signature, secret, 1700000000000), false);
});
