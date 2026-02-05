/**
 * Fallback script (no TS transpile) to grant platform super-admin/owner access.
 *
 * Run:
 *   node assign-super-admin-sql.cjs <emailOrUsername> [more...]
 *
 * What it does:
 * - sets legacy `users.role` = 'admin'
 * - upserts 'admin' into `user_roles`
 * - upserts super-org membership (organization_members) role = 'owner'
 */

require("dotenv").config();

const { Pool } = require("pg");

const SUPER_ORG_ID = "pivotal-b2b-super-org";

function normalizeIdentifier(v) {
  return String(v ?? "").trim();
}

async function main() {
  const identifiers = process.argv.slice(2).map(normalizeIdentifier).filter(Boolean);
  if (identifiers.length === 0) {
    console.error("Usage: node assign-super-admin-sql.cjs <emailOrUsername> [more...]");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL in environment (.env).");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let updated = 0;
  const client = await pool.connect();
  try {
    for (const identifier of identifiers) {
      await client.query("BEGIN");

      const { rows: found } = await client.query(
        `
        SELECT id, username, email, role
        FROM users
        WHERE lower(username) = lower($1) OR lower(email) = lower($1)
        LIMIT 1
        `,
        [identifier],
      );

      if (found.length === 0) {
        await client.query("ROLLBACK");
        console.warn(`❌ User not found: ${identifier}`);
        continue;
      }

      const user = found[0];

      await client.query(`UPDATE users SET role = 'admin', updated_at = now() WHERE id = $1`, [user.id]);

      await client.query(
        `
        INSERT INTO user_roles (user_id, role)
        VALUES ($1, 'admin')
        ON CONFLICT (user_id, role) DO NOTHING
        `,
        [user.id],
      );

      await client.query(
        `
        INSERT INTO organization_members (organization_id, user_id, role)
        VALUES ($1, $2, 'owner')
        ON CONFLICT (organization_id, user_id)
        DO UPDATE SET role = 'owner', updated_at = now()
        `,
        [SUPER_ORG_ID, user.id],
      );

      await client.query("COMMIT");
      updated += 1;
      console.log(`✅ ${user.username} (${user.email}) -> admin + super-org owner`);
    }
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`Done. Updated ${updated}/${identifiers.length} user(s).`);
  console.log("IMPORTANT: users must log out and log back in to refresh JWT roles.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

