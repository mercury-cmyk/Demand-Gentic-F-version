import fs from "node:fs";
import path from "node:path";
import { pool } from "../server/db";

type CliOptions = {
  file: string;
  execute: boolean;
  verbose: boolean;
};

type CsvLeadRow = {
  leadId: string;
  contactName: string;
  campaignName: string;
  convq: number | null;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    file: "qa_leads_convq_60_plus.csv",
    execute: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--file" && next) {
      options.file = next;
      i += 1;
      continue;
    }
    if (arg === "--execute") {
      options.execute = true;
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }
  }

  return options;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseCsv(filePath: string): CsvLeadRow[] {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const rows: CsvLeadRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const leadId = (cols[0] || "").trim();
    if (!isUuid(leadId)) continue;

    const contactName = (cols[2] || "").trim();
    const campaignName = (cols[3] || "").trim();
    const convqRaw = (cols[4] || "").trim();
    const convq = convqRaw.length > 0 && Number.isFinite(Number(convqRaw)) ? Number(convqRaw) : null;

    rows.push({
      leadId,
      contactName,
      campaignName,
      convq,
    });
  }

  const dedup = new Map<string, CsvLeadRow>();
  for (const row of rows) dedup.set(row.leadId, row);
  return Array.from(dedup.values());
}

async function createMissingLead(
  client: any,
  row: CsvLeadRow,
  execute: boolean
): Promise<"created" | "missing_source" | "dry_created"> {
  const source = await client.query(
    `
      SELECT
        c.id AS contact_id,
        camp.id AS campaign_id,
        COALESCE(NULLIF(c.full_name, ''), NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), $2) AS derived_contact_name,
        c.email AS contact_email,
        a.name AS account_name,
        COALESCE(a.industry_standardized, a.industry_raw) AS account_industry,
        cqr.call_session_id,
        cqr.dialer_call_attempt_id AS call_attempt_id,
        COALESCE(NULLIF(cqr.full_transcript, ''), NULLIF(dca.full_transcript, ''), NULLIF(cs.ai_transcript, '')) AS transcript,
        COALESCE(NULLIF(dca.recording_url, ''), NULLIF(cs.recording_url, '')) AS recording_url,
        COALESCE(dca.call_duration_seconds, cs.duration_sec) AS call_duration,
        COALESCE(NULLIF(dca.phone_dialed, ''), NULLIF(cs.to_number_e164, '')) AS dialed_number,
        COALESCE(NULLIF(dca.telnyx_call_id, ''), NULLIF(cs.telnyx_call_id, '')) AS telnyx_call_id
      FROM campaigns camp
      JOIN call_quality_records cqr ON cqr.campaign_id = camp.id
      LEFT JOIN contacts c ON c.id = cqr.contact_id
      LEFT JOIN accounts a ON a.id = c.account_id
      LEFT JOIN call_sessions cs ON cs.id = cqr.call_session_id
      LEFT JOIN dialer_call_attempts dca
        ON dca.id = cqr.dialer_call_attempt_id OR dca.call_session_id = cqr.call_session_id
      WHERE camp.name = $1
        AND (
          COALESCE(c.full_name, '') ILIKE $2
          OR COALESCE(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), '') ILIKE $2
        )
      ORDER BY cqr.created_at DESC
      LIMIT 1
    `,
    [row.campaignName, row.contactName]
  );

  if (source.rowCount === 0) {
    return "missing_source";
  }

  if (!execute) {
    return "dry_created";
  }

  const s = source.rows[0];
  await client.query(
    `
      INSERT INTO leads (
        id, contact_id, contact_name, contact_email, campaign_id, call_attempt_id,
        recording_url, call_duration, dialed_number, telnyx_call_id, transcript,
        qa_status, ai_score, ai_qualification_status, account_name, account_industry,
        qa_decision, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        'under_review', $12, 'qualified', $13, $14,
        'Created from ConvQ CSV backfill', NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `,
    [
      row.leadId,
      s.contact_id,
      s.derived_contact_name,
      s.contact_email,
      s.campaign_id,
      s.call_attempt_id,
      s.recording_url,
      s.call_duration,
      s.dialed_number,
      s.telnyx_call_id,
      s.transcript,
      row.convq,
      s.account_name,
      s.account_industry,
    ]
  );

  return "created";
}

async function hydrateLead(client: any, row: CsvLeadRow, execute: boolean) {
  if (!execute) return { updated: true, campaignId: null as string | null };

  const result = await client.query(
    `
      WITH src AS (
        SELECT
          l2.id AS lead_id,
          COALESCE(NULLIF(c.full_name, ''), NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), $3) AS derived_contact_name,
          c.email AS derived_email,
          a.name AS derived_account_name,
          COALESCE(a.industry_standardized, a.industry_raw) AS derived_industry,
          best.call_attempt_id,
          best.call_duration_seconds,
          best.phone_dialed,
          best.recording_url,
          best.full_transcript,
          best.telnyx_call_id
        FROM leads l2
        LEFT JOIN contacts c ON c.id = l2.contact_id
        LEFT JOIN accounts a ON a.id = c.account_id
        LEFT JOIN LATERAL (
          SELECT
            dca.id AS call_attempt_id,
            dca.call_duration_seconds,
            dca.phone_dialed,
            COALESCE(NULLIF(dca.recording_url, ''), NULLIF(cs.recording_url, '')) AS recording_url,
            dca.full_transcript,
            COALESCE(NULLIF(dca.telnyx_call_id, ''), NULLIF(cs.telnyx_call_id, '')) AS telnyx_call_id,
            dca.created_at
          FROM dialer_call_attempts dca
          LEFT JOIN call_sessions cs ON cs.id = dca.call_session_id
          WHERE
            dca.id = l2.call_attempt_id
            OR (l2.telnyx_call_id IS NOT NULL AND cs.telnyx_call_id = l2.telnyx_call_id)
            OR (l2.contact_id IS NOT NULL AND l2.campaign_id IS NOT NULL AND dca.contact_id = l2.contact_id AND dca.campaign_id = l2.campaign_id)
          ORDER BY
            CASE
              WHEN dca.id = l2.call_attempt_id THEN 1
              WHEN l2.telnyx_call_id IS NOT NULL AND cs.telnyx_call_id = l2.telnyx_call_id THEN 2
              ELSE 3
            END,
            dca.created_at DESC
          LIMIT 1
        ) best ON true
        WHERE l2.id = $1
      )
      UPDATE leads l
      SET
        qa_status = CASE WHEN l.qa_status IN ('approved', 'published') THEN l.qa_status ELSE 'under_review' END,
        ai_score = COALESCE($2::numeric, l.ai_score),
        ai_qualification_status = CASE
          WHEN $2::numeric >= 60 THEN 'qualified'
          WHEN l.ai_qualification_status IS NULL THEN 'qualified'
          ELSE l.ai_qualification_status
        END,
        contact_name = COALESCE(NULLIF(l.contact_name, ''), src.derived_contact_name),
        contact_email = COALESCE(NULLIF(l.contact_email, ''), src.derived_email),
        account_name = COALESCE(NULLIF(l.account_name, ''), src.derived_account_name),
        account_industry = COALESCE(NULLIF(l.account_industry, ''), src.derived_industry),
        call_attempt_id = COALESCE(l.call_attempt_id, src.call_attempt_id),
        call_duration = COALESCE(l.call_duration, src.call_duration_seconds),
        dialed_number = COALESCE(NULLIF(l.dialed_number, ''), src.phone_dialed),
        recording_url = COALESCE(NULLIF(l.recording_url, ''), src.recording_url),
        transcript = COALESCE(NULLIF(l.transcript, ''), src.full_transcript),
        telnyx_call_id = COALESCE(NULLIF(l.telnyx_call_id, ''), src.telnyx_call_id),
        updated_at = NOW()
      FROM src
      WHERE l.id = $1
      RETURNING l.id, l.campaign_id
    `,
    [row.leadId, row.convq, row.contactName]
  );

  if (result.rowCount === 0) {
    return { updated: false, campaignId: null as string | null };
  }
  return { updated: true, campaignId: result.rows[0].campaign_id as string | null };
}

async function ensureQcQueue(client: any, leadId: string, convq: number | null, execute: boolean) {
  const existing = await client.query(`SELECT id FROM qc_work_queue WHERE lead_id = $1 LIMIT 1`, [leadId]);
  if (existing.rowCount > 0) return { inserted: false };
  if (!execute) return { inserted: true };

  const res = await client.query(
    `
      INSERT INTO qc_work_queue (
        call_session_id,
        lead_id,
        campaign_id,
        producer_type,
        status,
        priority,
        created_at,
        updated_at
      )
      SELECT
        COALESCE(cs.id, dca.call_session_id) AS call_session_id,
        l.id AS lead_id,
        l.campaign_id,
        CASE WHEN dca.agent_type = 'human' THEN 'human'::agent_type ELSE 'ai'::agent_type END AS producer_type,
        'pending',
        CASE
          WHEN COALESCE($2::numeric, 0) >= 90 THEN 5
          WHEN COALESCE($2::numeric, 0) >= 80 THEN 3
          ELSE 1
        END,
        NOW(),
        NOW()
      FROM leads l
      LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
      WHERE l.id = $1
        AND l.campaign_id IS NOT NULL
      LIMIT 1
      RETURNING id
    `,
    [leadId, convq]
  );

  return { inserted: res.rowCount > 0 };
}

async function main() {
  const options = parseArgs();
  const filePath = path.resolve(process.cwd(), options.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const rows = parseCsv(filePath);
  if (rows.length === 0) {
    throw new Error(`No valid rows found in: ${options.file}`);
  }

  console.log("==============================================");
  console.log("ENSURE CSV LEADS IN LEADS + QA");
  console.log("==============================================");
  console.log(`File: ${options.file}`);
  console.log(`Rows: ${rows.length}`);
  console.log(`Mode: ${options.execute ? "EXECUTE" : "DRY RUN"}`);
  console.log("");

  const client = await pool.connect();
  const stats = {
    foundExisting: 0,
    createdMissing: 0,
    unresolvedMissing: 0,
    leadsUpdated: 0,
    qcInserted: 0,
    qcAlreadyExists: 0,
    failed: 0,
  };

  try {
    await client.query("BEGIN");

    for (const row of rows) {
      try {
        const leadCheck = await client.query(
          `SELECT id FROM leads WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
          [row.leadId]
        );

        if (leadCheck.rowCount === 0) {
          const created = await createMissingLead(client, row, options.execute);
          if (created === "missing_source") {
            stats.unresolvedMissing += 1;
            stats.failed += 1;
            console.log(`UNRESOLVED source missing | ${row.leadId} | ${row.contactName} | ${row.campaignName}`);
            continue;
          }
          if (created === "created") {
            stats.createdMissing += 1;
          } else if (created === "dry_created") {
            stats.createdMissing += 1;
          }
          if (options.verbose) {
            console.log(`Created missing lead | ${row.leadId} | ${row.contactName}`);
          }
        } else {
          stats.foundExisting += 1;
        }

        const hydrated = await hydrateLead(client, row, options.execute);
        if (hydrated.updated) {
          stats.leadsUpdated += 1;
        } else {
          stats.failed += 1;
          console.log(`FAILED to hydrate lead | ${row.leadId}`);
          continue;
        }

        const queue = await ensureQcQueue(client, row.leadId, row.convq, options.execute);
        if (queue.inserted) stats.qcInserted += 1;
        else stats.qcAlreadyExists += 1;

        if (options.verbose) {
          console.log(`OK | ${row.leadId} | convq=${row.convq ?? "null"} | qa=under_review`);
        }
      } catch (error: any) {
        stats.failed += 1;
        console.log(`FAILED | ${row.leadId} | ${error?.message || "unknown error"}`);
      }
    }

    if (options.execute) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log("");
  console.log("==============================================");
  console.log("SUMMARY");
  console.log("==============================================");
  console.log(`Existing leads found: ${stats.foundExisting}`);
  console.log(`Missing leads created: ${stats.createdMissing}`);
  console.log(`Missing unresolved: ${stats.unresolvedMissing}`);
  console.log(`Leads updated/enriched: ${stats.leadsUpdated}`);
  console.log(`QC queue inserted: ${stats.qcInserted}`);
  console.log(`QC queue already existed: ${stats.qcAlreadyExists}`);
  console.log(`Failed rows: ${stats.failed}`);
  console.log(`Mode: ${options.execute ? "EXECUTE" : "DRY RUN"}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
