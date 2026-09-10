const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SECRET_FILE = path.join(process.cwd(), '.orvia-secret');

function getMasterKey() {
  if (process.env.ORVIA_TOKEN_ENCRYPTION_KEY) {
    return crypto.createHash('sha256').update(process.env.ORVIA_TOKEN_ENCRYPTION_KEY).digest();
  }
  try {
    if (fs.existsSync(SECRET_FILE)) return Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8').trim(), 'base64');
    const key = crypto.randomBytes(32);
    fs.writeFileSync(SECRET_FILE, key.toString('base64'), { mode: 0o600 });
    return key;
  } catch (error) {
    throw new Error(`Unable to initialize Orvia token encryption: ${error.message}`);
  }
}

function encrypt(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

function decrypt(value) {
  if (!value) return '';
  const raw = String(value);
  if (!raw.startsWith('v1:')) return raw;
  const [, ivRaw, tagRaw, ciphertextRaw] = raw.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getMasterKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, 'base64url')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
