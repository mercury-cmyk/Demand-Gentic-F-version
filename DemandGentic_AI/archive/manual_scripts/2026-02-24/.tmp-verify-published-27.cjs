require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const q = await client.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE qa_status = 'published')::int AS published,
        count(*) FILTER (WHERE submitted_to_client = true)::int AS submitted_to_client,
        count(*) FILTER (WHERE pm_approved_at IS NOT NULL)::int AS pm_approved,
        count(*) FILTER (WHERE (qa_data->'lastPmApprovalOverride') IS NOT NULL)::int AS with_override_audit
      FROM leads
      WHERE id = ANY($1::text[])
    `, [[
      'b599b3ef-6020-4d01-8e4b-3ee19d237bb9','ffc0bfde-a5e6-4737-98df-0dbdac6f9e4a','a431d9ea-b5cc-4b2f-bf0a-7651a214efbb','c29c0476-7488-4af2-b5d1-7c90917ded1c','c6632683-b961-4a74-99eb-10624237839f','ff025349-8cd5-46ac-9c71-2b170f8a996b','7e47503c-87b5-44dd-83a2-06794192647a','db7acb80-091a-4036-93eb-b33a2e8eb5fe','bc044ab7-95f5-4bd5-9e84-4ab3c670fda3','e92f5bd0-e1ab-4ee9-9a7d-e7453d24db65','36993129-22a9-49f2-9f71-fc3a743e9b25','1cd2ac5f-0501-4924-928b-df2cc14325a3','853ace05-9d09-4508-b5a8-6e70904a9723','0fd7b311-2467-46e3-af01-f580f7d59e27','2aae371f-7d7b-40cb-9aa1-913870df7152','1ccc8a1f-4503-4379-85c2-c69b09942031','f673082f-ba4a-42d2-bda3-7e26eb531549','15ad703e-8abb-45b7-9a7a-b156e33d00e0','ae6a8107-7795-44a5-befd-cfb4b462881c','f6e4222a-d08d-405d-b2ee-9f50e7f0bed6','9b58e707-79ad-4f02-b475-25283815ff49','20466f4f-3c2f-4311-af3d-6db1207be0d2','b650c6eb-167e-4320-a9c9-6ea4e318b84b','c1399c8e-598d-4003-9a99-56316f36688d','4c8775f8-560a-4299-a4b9-513cc82a6059','77add32f-1fb4-4e59-b488-d749f85d5529','54b87a11-c69f-4b53-803a-2e6a41f629b8'
    ]]);
    console.table(q.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch(e => { console.error(e); process.exit(1); });