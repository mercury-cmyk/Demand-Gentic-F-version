import pg from 'pg';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function decryptValue(payload, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, null, 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

const masterKey = process.env.SECRET_MANAGER_MASTER_KEY || process.env.SESSION_SECRET;
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

const r = await client.query("SELECT name, encrypted_value FROM secret_store WHERE name = 'OPENAI_API_KEY' AND environment = 'production' AND is_active = true LIMIT 1");
const apiKey = decryptValue(r.rows[0].encrypted_value, masterKey);
await client.end();

// Test the key against OpenAI
const res = await fetch('https://api.openai.com/v1/models', {
  headers: { 'Authorization': 'Bearer ' + apiKey }
});
console.log('OpenAI API test status:', res.status);
if (res.status === 200) {
  console.log('KEY IS VALID');
  console.log('FULL_KEY=' + apiKey);
} else {
  const body = await res.text();
  console.log('KEY IS INVALID:', body.substring(0, 200));
  console.log('KEY_PREVIEW=' + apiKey.substring(0, 20) + '...' + apiKey.substring(apiKey.length - 10));
}
