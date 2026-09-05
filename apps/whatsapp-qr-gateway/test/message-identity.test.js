import assert from "node:assert/strict";
import { phoneFromJid, resolveSenderIdentity } from "../src/message-identity.js";

assert.equal(phoneFromJid("243900000001@s.whatsapp.net"), "+243900000001");
assert.equal(phoneFromJid("123456789012345@lid"), null);
assert.equal(phoneFromJid("120363123456789012@newsletter"), null);

const groupSender = resolveSenderIdentity({
  participant: "123456789012345@lid",
  participantLid: "123456789012345@lid",
  participantPn: "243900000001@s.whatsapp.net",
}, true);
assert.equal(groupSender.phone, "+243900000001");
assert.equal(groupSender.senderJid, "123456789012345@lid");

const mappedSender = resolveSenderIdentity({
  participant: "123456789012345@lid",
}, true, new Map([["123456789012345@lid", "243900000002@s.whatsapp.net"]]));
assert.equal(mappedSender.phone, "+243900000002");

console.log("message identity tests passed");
