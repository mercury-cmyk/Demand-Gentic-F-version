require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  const reason = 'PM override requested by client on 2026-02-19: publish despite missing transcription.';

  try {
    await client.query('BEGIN');

    const actorQ = await client.query(`
      SELECT id
      FROM users
      WHERE role IN ('admin','campaign_manager')
      ORDER BY created_at ASC
      LIMIT 1
    `);
    const actorId = actorQ.rows[0]?.id || null;

    const candidatesQ = await client.query(`
      SELECT id, qa_data
      FROM leads
      WHERE qa_status IN ('approved','pending_pm_review')
        AND pm_approved_at IS NULL
      ORDER BY created_at DESC
      LIMIT 27
    `);

    if (candidatesQ.rowCount === 0) {
      console.log('No PM-review leads found to publish.');
      await client.query('ROLLBACK');
      return;
    }

    const nowIso = new Date().toISOString();
    let updated = 0;

    for (const row of candidatesQ.rows) {
      const currentQaData = row.qa_data && typeof row.qa_data === 'object' ? row.qa_data : {};
      const currentOverrides = Array.isArray(currentQaData.pmApprovalOverrides)
        ? currentQaData.pmApprovalOverrides
        : [];

      const overrideEntry = {
        timestamp: nowIso,
        approvedById: actorId,
        reason,
        qualityErrors: ['Missing call transcription'],
        mode: 'bulk_manual_override',
      };

      const nextQaData = {
        ...currentQaData,
        pmApprovalOverrides: [...currentOverrides, overrideEntry],
        lastPmApprovalOverride: overrideEntry,
      };

      await client.query(`
        UPDATE leads
        SET qa_status = 'published',
            published_at = NOW(),
            published_by = $2,
            pm_approved_at = NOW(),
            pm_approved_by = $2,
            submitted_to_client = true,
            submitted_at = NOW(),
            delivery_source = 'manual',
            qa_data = $3::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `, [row.id, actorId, JSON.stringify(nextQaData)]);
      updated += 1;
    }

    await client.query('COMMIT');

    const verifyQ = await client.query(`
      SELECT qa_status, count(*)::int as count
      FROM leads
      WHERE id = ANY($1::text[])
      GROUP BY qa_status
      ORDER BY qa_status
    `, [candidatesQ.rows.map(r => r.id)]);

    console.log(`Published leads: ${updated}`);
    console.table(verifyQ.rows);
    console.log('Lead IDs updated:');
    console.log(candidatesQ.rows.map(r => r.id).join('\n'));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
