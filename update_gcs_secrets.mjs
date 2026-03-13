import pg from 'pg';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptValue(value, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

const masterKey = process.env.SECRET_MANAGER_MASTER_KEY || process.env.SESSION_SECRET;
if (!masterKey) throw new Error('No master key found');

const secrets = [
  { name: 'GCS_BUCKET', value: 'demandgentic-ai-recordings', context: 'gcs' },
  { name: 'GCS_PROJECT_ID', value: 'demandgentic', context: 'gcs' },
  { name: 'GCP_PROJECT_ID', value: 'demandgentic', context: 'gcs' },
  { name: 'GOOGLE_CLOUD_PROJECT', value: 'demandgentic', context: 'gcs' },
  { name: 'BREVO_API_KEY', value: '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', context: 'brevo' },
];

const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

for (const s of secrets) {
  const encrypted = encryptValue(s.value, masterKey);
  const usageContext = s.context || 'gcs';
  const upsert = `
    INSERT INTO secret_store (name, encrypted_value, environment, service, usage_context, is_active, created_at, updated_at)
    VALUES ($1, $2, 'production', 'config', $3, true, NOW(), NOW())
    ON CONFLICT (name, environment) DO UPDATE SET encrypted_value = $2, usage_context = $3, updated_at = NOW(), is_active = true
  `;
  await client.query(upsert, [s.name, encrypted, usageContext]);
  console.log('Upserted', s.name);
}

await client.end();
console.log('All done.');
