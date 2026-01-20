import crypto from 'node:crypto';
import fs from 'node:fs';

const KEY_FILE = 'data/master.key';

export function loadOrCreateMasterKey(): Buffer {
  if (fs.existsSync(KEY_FILE)) {
    const raw = fs.readFileSync(KEY_FILE, 'utf8').trim();
    return Buffer.from(raw, 'base64');
  }

  fs.mkdirSync('data', { recursive: true });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString('base64'), { encoding: 'utf8', mode: 0o600 });
  return key;
}

export function encryptString(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // v1:<iv_b64>:<tag_b64>:<cipher_b64>
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptString(payload: string, key: Buffer): string {
  const [v, ivB64, tagB64, cipherB64] = payload.split(':');
  if (v !== 'v1' || !ivB64 || !tagB64 || !cipherB64) throw new Error('Invalid encrypted payload format');

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(cipherB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
