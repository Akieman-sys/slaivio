import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";
import { pool } from "./db.js";
import { decryptPayload, encryptPayload } from "./crypto.js";

const serialize = value => Buffer.from(JSON.stringify(value, BufferJSON.replacer));
const deserialize = value => JSON.parse(value.toString("utf8"), BufferJSON.reviver);

async function read(connectionId, keyType, keyId) {
  const result = await pool.query(
    `select encrypted_payload,nonce,auth_tag from whatsapp_qr_auth_state
     where connection_id=$1 and key_type=$2 and key_id=$3`,
    [connectionId, keyType, keyId],
  );
  if (!result.rowCount) return undefined;
  return deserialize(decryptPayload(result.rows[0]));
}

async function write(connectionId, keyType, keyId, value) {
  if (value == null) {
    await pool.query(`delete from whatsapp_qr_auth_state where connection_id=$1 and key_type=$2 and key_id=$3`, [connectionId, keyType, keyId]);
    return;
  }
  const encrypted = encryptPayload(serialize(value));
  await pool.query(
    `insert into whatsapp_qr_auth_state(connection_id,key_type,key_id,encrypted_payload,nonce,auth_tag)
     values($1,$2,$3,$4,$5,$6)
     on conflict(connection_id,key_type,key_id) do update set encrypted_payload=excluded.encrypted_payload,
       nonce=excluded.nonce,auth_tag=excluded.auth_tag,version=whatsapp_qr_auth_state.version+1,updated_at=now()`,
    [connectionId, keyType, keyId, encrypted.encryptedPayload, encrypted.nonce, encrypted.authTag],
  );
}

export async function createPostgresAuthState(connectionId) {
  let creds = await read(connectionId, "creds", "default");
  if (!creds) {
    creds = initAuthCreds();
    await write(connectionId, "creds", "default", creds);
  }
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          await Promise.all(ids.map(async id => {
            let value = await read(connectionId, type, id);
            if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            result[id] = value;
          }));
          return result;
        },
        set: async data => {
          const writes = [];
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries || {})) writes.push(write(connectionId, type, id, value));
          }
          await Promise.all(writes);
        },
      },
    },
    saveCreds: () => write(connectionId, "creds", "default", creds),
    clear: () => pool.query(`delete from whatsapp_qr_auth_state where connection_id=$1`, [connectionId]),
  };
}
