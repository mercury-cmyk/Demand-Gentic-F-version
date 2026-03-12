/**
 * One-time script: insert OpenAI API key into secret_store.
 * Run on the VM: node vm-deploy/seed-openai-secret.mjs
 */
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const MASTER_KEY = process.env.SECRET_MANAGER_MASTER_KEY || process.env.SESSION_SECRET;
if (!MASTER_KEY) {
  console.error('ERROR: SECRET_MANAGER_MASTER_KEY not set');
  process.exit(1);
}

const OPENAI_KEY = process.env.OPENAI_KEY_TO_SEED;
if (!OPENAI_KEY) {
  console.error('ERROR: OPENAI_KEY_TO_SEED not set');
  process.exit(1);
}

function encryptJson(value, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const serialized = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(serialized), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const secrets = [
  {
    name: 'AI_INTEGRATIONS_OPENAI_API_KEY',
    service: 'openai',
    usage_context: 'voice_realtime',
    description: 'OpenAI Realtime API key for voice calls',
  },
  {
    name: 'OPENAI_API_KEY',
    service: 'openai',
    usage_context: 'voice_realtime',
    description: 'OpenAI API key (fallback name)',
  },
];

for (const s of secrets) {
  for (const env of ['development', 'production']) {
    const encrypted = encryptJson(OPENAI_KEY, MASTER_KEY);

    const existing = await pool.query(
      `SELECT id FROM secret_store WHERE name = $1 AND environment = $2 LIMIT 1`,
      [s.name, env]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE secret_store
         SET encrypted_value = $1, is_active = true, updated_at = NOW()
         WHERE name = $2 AND environment = $3`,
        [encrypted, s.name, env]
      );
      console.log(`✅ Updated: ${s.name} [${env}]`);
    } else {
      await pool.query(
        `INSERT INTO secret_store
           (id, name, description, service, usage_context, environment, encrypted_value, is_active, created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, NOW(), NOW())`,
        [s.name, s.description, s.service, s.usage_context, env, encrypted]
      );
      console.log(`✅ Inserted: ${s.name} [${env}]`);
    }
  }
}

await pool.end();
console.log('\nDone. Restart the API container or clear secret cache for changes to take effect.');
