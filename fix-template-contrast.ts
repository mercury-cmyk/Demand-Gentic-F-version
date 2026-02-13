import { pool } from './server/db';

async function main() {
  const client = await pool.connect();
  try {
    // Delete all existing templates so seedDefaultTemplates() re-creates them with email-safe HTML
    const res = await client.query(
      `DELETE FROM mercury_templates WHERE template_key IN ('client_invite','project_request_approved','project_request_rejected','campaign_launched','leads_delivered','test_notification')`
    );
    console.log('Templates deleted:', res.rowCount);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
