/**
 * Re-encrypt secrets that failed decryption due to key mismatch.
 * Standalone — does NOT import server/env.ts (avoids env isolation check).
 *
 * Run: npx tsx --env-file=.env scripts/reencrypt-secrets.ts
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

// ── Encryption (mirrors server/lib/encryption.ts) ──────────────────────────
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function buildKey(secret: string) {
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptJson(value: unknown, secret: string): string {
  const key = buildKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const serialized = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(serialized), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function tryDecrypt(payload: string, secret: string): string | null {
  try {
    const buffer = Buffer.from(payload, 'base64');
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const key = buildKey(secret);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const val = JSON.parse(decrypted.toString('utf8'));
    return typeof val === 'string' ? val : JSON.stringify(val);
  } catch {
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

const MASTER_KEY = process.env.SECRET_MANAGER_MASTER_KEY || process.env.SESSION_SECRET || '';
const DB_URL = process.env.DATABASE_URL_DEV || process.env.DATABASE_URL || '';

if (!MASTER_KEY) {
  console.error('ERROR: SECRET_MANAGER_MASTER_KEY or SESSION_SECRET must be set in .env');
  process.exit(1);
}
if (!DB_URL) {
  console.error('ERROR: DATABASE_URL or DATABASE_URL_DEV must be set in .env');
  process.exit(1);
}

const SECRETS_TO_FIX = ['OPENAI_API_KEY', 'AI_INTEGRATIONS_OPENAI_API_KEY', 'DATABASE_URL'];

async function main() {
  console.log('Connecting to database...');
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('Connected.\n');

  let fixed = 0;
  let skipped = 0;
  let alreadyOk = 0;

  for (const name of SECRETS_TO_FIX) {
    const plaintext = process.env[name];
    if (!plaintext) {
      console.warn(`  SKIP: ${name} — not found in .env`);
      skipped++;
      continue;
    }

    const { rows } = await client.query(
      `SELECT id, environment, encrypted_value FROM secret_store WHERE name = $1 AND is_active = true`,
      [name]
    );

    if (rows.length === 0) {
      console.warn(`  SKIP: ${name} — not found in secret_store table`);
      skipped++;
      continue;
    }

    for (const row of rows) {
      // Check if it already decrypts fine
      const current = tryDecrypt(row.encrypted_value, MASTER_KEY);
      if (current !== null) {
        console.log(`  OK:    ${name} [${row.environment}] — already decrypts correctly`);
        alreadyOk++;
        continue;
      }

      // Re-encrypt with current master key
      const newEncrypted = encryptJson(plaintext, MASTER_KEY);
      await client.query(
        `UPDATE secret_store SET encrypted_value = $1, updated_at = now() WHERE id = $2`,
        [newEncrypted, row.id]
      );
      console.log(`  ✅ Fixed: ${name} [${row.environment}]`);
      fixed++;
    }
  }

  await client.end();
  console.log(`\nDone: ${fixed} re-encrypted, ${alreadyOk} already OK, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});