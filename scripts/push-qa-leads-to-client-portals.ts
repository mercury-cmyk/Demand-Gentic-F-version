import fs from "node:fs";
import path from "node:path";
import { pool } from "../server/db";

type CliOptions = {
  file: string;
  execute: boolean;
  verbose: boolean;
  limit?: number;
  onlyClientId?: string;
};

type CsvLead = {
  leadId: string;
  convq?: number;
};

type LeadRow = {
  id: string;
  contact_name: string | null;
  contact_email: string | null;
  campaign_id: string | null;
  transcript: string | null;
  recording_url: string | null;
  recording_s3_key: string | null;
  call_duration: number | null;
  ai_score: number | null;
  ai_analysis: Record<string, unknown> | null;
  qa_status: string;
  submitted_to_client: boolean | null;
  campaign_name: string | null;
  project_id: string | null;
};

type ClientAccountRow = {
  id: string;
  name: string;
  visibility_settings: Record<string, unknown> | null;
};

type ExistingMockCallRow = {
  id: string;
  client_account_id: string;
  source_lead_id: string;
  qa_content_id: string | null;
};

type ExistingQaRow = {
  id: string;
  content_id: string;
  client_account_id: string | null;
  qa_status: string;
  client_visible: boolean;
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
    if (arg === "--limit" && next) {
      options.limit = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--only-client-id" && next) {
      options.onlyClientId = next;
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseCsvLeads(filePath: string): CsvLead[] {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const parsed: CsvLead[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(",");
    const leadId = (cols[0] || "").trim();
    if (!isUuid(leadId)) continue;

    const convqRaw = (cols[4] || "").trim();
    const convq = convqRaw ? Number(convqRaw) : undefined;

    parsed.push({
      leadId,
      convq: Number.isFinite(convq) ? convq : undefined,
    });
  }

  const deduped = new Map<string, CsvLead>();
  for (const row of parsed) {
    if (!deduped.has(row.leadId)) {
      deduped.set(row.leadId, row);
    }
  }

  return Array.from(deduped.values());
}

function buildCallName(lead: LeadRow, score?: number): string {
  const who = lead.contact_name || "Unknown Contact";
  const campaign = lead.campaign_name || "Unknown Campaign";
  return score !== undefined
    ? `${who} - ${campaign} (ConvQ ${score})`
    : `${who} - ${campaign}`;
}

function getDisposition(lead: LeadRow): string | null {
  const analysis = (lead.ai_analysis || {}) as Record<string, unknown>;
  const direct = typeof analysis.disposition === "string" ? analysis.disposition : null;
  if (direct) return direct;

  const nested = analysis.dispositionReview as Record<string, unknown> | undefined;
  if (nested && typeof nested.assignedDisposition === "string") {
    return nested.assignedDisposition;
  }

  return null;
}

function key(clientId: string, leadId: string): string {
  return `${clientId}|${leadId}`;
}

function qaKey(clientId: string, mockCallId: string): string {
  return `${clientId}|${mockCallId}`;
}

async function main() {
  const options = parseArgs();
  const csvPath = path.resolve(process.cwd(), options.file);

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const csvLeads = parseCsvLeads(csvPath);
  if (csvLeads.length === 0) {
    throw new Error(`No valid lead IDs found in ${options.file}`);
  }

  const selectedCsvLeads = options.limit && options.limit > 0
    ? csvLeads.slice(0, options.limit)
    : csvLeads;

  const leadIds = selectedCsvLeads.map((row) => row.leadId);
  const convqByLeadId = new Map<string, number>();
  for (const row of selectedCsvLeads) {
    if (row.convq !== undefined) convqByLeadId.set(row.leadId, row.convq);
  }

  console.log(`[PushSampleCalls] File: ${options.file}`);
  console.log(`[PushSampleCalls] Lead IDs from CSV: ${leadIds.length}`);
  console.log(`[PushSampleCalls] Mode: ${options.execute ? "EXECUTE" : "DRY RUN"}`);
  if (options.onlyClientId) {
    console.log(`[PushSampleCalls] Client filter: ${options.onlyClientId}`);
  }

  const client = await pool.connect();
  try {
    const accountsQuery = options.onlyClientId
      ? `
        SELECT id, name, visibility_settings
        FROM client_accounts
        WHERE is_active = true AND id = $1
        ORDER BY created_at
      `
      : `
        SELECT id, name, visibility_settings
        FROM client_accounts
        WHERE is_active = true
        ORDER BY created_at
      `;
    const accountParams = options.onlyClientId ? [options.onlyClientId] : [];
    const accountsRes = await client.query<ClientAccountRow>(accountsQuery, accountParams);
    const accounts = accountsRes.rows;

    if (accounts.length === 0) {
      throw new Error("No active client accounts found for this request.");
    }

    const leadRes = await client.query<LeadRow>(
      `
      SELECT
        l.id,
        l.contact_name,
        l.contact_email,
        l.campaign_id,
        l.transcript,
        l.recording_url,
        l.recording_s3_key,
        l.call_duration,
        l.ai_score::float AS ai_score,
        l.ai_analysis,
        l.qa_status,
        l.submitted_to_client,
        c.name AS campaign_name,
        c.project_id
      FROM leads l
      LEFT JOIN campaigns c ON c.id = l.campaign_id
      WHERE l.deleted_at IS NULL
        AND l.id = ANY($1::varchar[])
      `,
      [leadIds]
    );

    const leadsById = new Map<string, LeadRow>();
    for (const row of leadRes.rows) leadsById.set(row.id, row);

    const missingLeadIds = leadIds.filter((id) => !leadsById.has(id));
    if (missingLeadIds.length > 0) {
      console.log(`[PushSampleCalls] Missing leads in DB: ${missingLeadIds.length}`);
      if (options.verbose) {
        for (const id of missingLeadIds) {
          console.log(`  - ${id}`);
        }
      }
    }

    const existingLeadIds = leadIds.filter((id) => leadsById.has(id));
    const clientIds = accounts.map((a) => a.id);

    const existingMockCallsRes = await client.query<ExistingMockCallRow>(
      `
      SELECT
        id,
        client_account_id,
        qa_content_id,
        ai_analysis->>'sourceLeadId' AS source_lead_id
      FROM client_mock_calls
      WHERE call_type = 'sample'
        AND client_account_id = ANY($1::varchar[])
        AND ai_analysis ? 'sourceLeadId'
        AND ai_analysis->>'sourceLeadId' = ANY($2::varchar[])
      `,
      [clientIds, existingLeadIds]
    );

    const existingMockByLeadAndClient = new Map<string, ExistingMockCallRow>();
    const existingMockCallIds: string[] = [];
    for (const row of existingMockCallsRes.rows) {
      existingMockByLeadAndClient.set(key(row.client_account_id, row.source_lead_id), row);
      existingMockCallIds.push(row.id);
    }

    const existingQaByClientAndMock = new Map<string, ExistingQaRow>();
    if (existingMockCallIds.length > 0) {
      const existingQaRes = await client.query<ExistingQaRow>(
        `
        SELECT
          id,
          content_id,
          client_account_id,
          qa_status,
          client_visible
        FROM qa_gated_content
        WHERE content_type = 'mock_call'
          AND content_id = ANY($1::varchar[])
          AND client_account_id = ANY($2::varchar[])
        `,
        [existingMockCallIds, clientIds]
      );

      for (const row of existingQaRes.rows) {
        if (!row.client_account_id) continue;
        existingQaByClientAndMock.set(qaKey(row.client_account_id, row.content_id), row);
      }
    }

    const stats = {
      clients: accounts.length,
      leadsRequested: leadIds.length,
      leadsFound: existingLeadIds.length,
      missingLeads: missingLeadIds.length,
      candidatePairs: accounts.length * existingLeadIds.length,
      existingSampleCalls: 0,
      sampleCallsCreated: 0,
      qaCreated: 0,
      qaUpdated: 0,
      mockCallsLinkedToQa: 0,
      visibilityUpdated: 0,
    };

    if (options.execute) {
      await client.query("BEGIN");
    }

    for (const account of accounts) {
      const currentVisibility = (account.visibility_settings || {}) as Record<string, unknown>;
      const nextVisibility: Record<string, unknown> = {
        ...currentVisibility,
        showLeads: true,
        showRecordings: true,
        showMockCalls: true,
        showProjectDetails: true,
      };

      const visibilityNeedsUpdate =
        currentVisibility.showLeads !== true ||
        currentVisibility.showRecordings !== true ||
        currentVisibility.showMockCalls !== true ||
        currentVisibility.showProjectDetails !== true;

      if (visibilityNeedsUpdate) {
        stats.visibilityUpdated += 1;
        if (options.execute) {
          await client.query(
            `
            UPDATE client_accounts
            SET visibility_settings = $2::jsonb,
                updated_at = NOW()
            WHERE id = $1
            `,
            [account.id, JSON.stringify(nextVisibility)]
          );
        }
      }

      for (const leadId of existingLeadIds) {
        const lead = leadsById.get(leadId);
        if (!lead) continue;

        const pairKey = key(account.id, leadId);
        let mock = existingMockByLeadAndClient.get(pairKey);
        let mockCallId = mock?.id;
        const scoreFromCsv = convqByLeadId.get(leadId);
        const score = scoreFromCsv ?? (lead.ai_score !== null ? Math.round(Number(lead.ai_score)) : undefined);

        if (mockCallId) {
          stats.existingSampleCalls += 1;
        } else {
          if (options.execute) {
            const aiAnalysisPayload: Record<string, unknown> = {
              sourceLeadId: lead.id,
              sourceCampaignId: lead.campaign_id,
              sourceCampaignName: lead.campaign_name,
              sourceQaStatus: lead.qa_status,
              sourceSubmittedToClient: lead.submitted_to_client,
              pushedByScript: "push-qa-leads-to-client-portals.ts",
              pushedAt: new Date().toISOString(),
              convq: score,
            };

            const insertedMockRes = await client.query<{ id: string }>(
              `
              INSERT INTO client_mock_calls (
                client_account_id,
                campaign_id,
                project_id,
                call_name,
                recording_url,
                recording_s3_key,
                transcript,
                duration_seconds,
                call_type,
                disposition,
                ai_analysis,
                ai_score
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, 'sample', $9, $10::jsonb, $11
              )
              RETURNING id
              `,
              [
                account.id,
                lead.campaign_id,
                lead.project_id,
                buildCallName(lead, score),
                lead.recording_url,
                lead.recording_s3_key,
                lead.transcript,
                lead.call_duration,
                getDisposition(lead),
                JSON.stringify(aiAnalysisPayload),
                score ?? null,
              ]
            );

            mockCallId = insertedMockRes.rows[0]?.id;
            if (!mockCallId) {
              throw new Error(`Failed to create mock call for lead ${lead.id} and client ${account.id}`);
            }

            mock = {
              id: mockCallId,
              client_account_id: account.id,
              source_lead_id: lead.id,
              qa_content_id: null,
            };
            existingMockByLeadAndClient.set(pairKey, mock);
          }
          stats.sampleCallsCreated += 1;
        }

        if (!mockCallId) {
          continue;
        }

        const qaMapKey = qaKey(account.id, mockCallId);
        let qa = existingQaByClientAndMock.get(qaMapKey);

        if (!qa) {
          if (options.execute) {
            const insertedQaRes = await client.query<{ id: string }>(
              `
              INSERT INTO qa_gated_content (
                content_type,
                content_id,
                campaign_id,
                client_account_id,
                project_id,
                qa_status,
                qa_score,
                client_visible,
                published_at,
                created_at,
                updated_at
              )
              VALUES (
                'mock_call',
                $1,
                $2,
                $3,
                $4,
                'published',
                $5,
                true,
                NOW(),
                NOW(),
                NOW()
              )
              ON CONFLICT (content_type, content_id, client_account_id)
              DO UPDATE SET
                qa_status = 'published',
                qa_score = COALESCE(qa_gated_content.qa_score, EXCLUDED.qa_score),
                client_visible = true,
                published_at = COALESCE(qa_gated_content.published_at, NOW()),
                updated_at = NOW()
              RETURNING id
              `,
              [
                mockCallId,
                lead.campaign_id,
                account.id,
                lead.project_id,
                score ?? null,
              ]
            );

            const qaId = insertedQaRes.rows[0]?.id;
            if (!qaId) {
              throw new Error(`Failed to ensure QA content for mock call ${mockCallId}`);
            }

            qa = {
              id: qaId,
              content_id: mockCallId,
              client_account_id: account.id,
              qa_status: "published",
              client_visible: true,
            };
            existingQaByClientAndMock.set(qaMapKey, qa);
          }
          stats.qaCreated += 1;
        } else if (qa.qa_status !== "published" || qa.client_visible !== true) {
          if (options.execute) {
            await client.query(
              `
              UPDATE qa_gated_content
              SET qa_status = 'published',
                  client_visible = true,
                  published_at = COALESCE(published_at, NOW()),
                  updated_at = NOW()
              WHERE id = $1
              `,
              [qa.id]
            );
          }

          qa.qa_status = "published";
          qa.client_visible = true;
          existingQaByClientAndMock.set(qaMapKey, qa);
          stats.qaUpdated += 1;
        }

        if (qa) {
          const currentQaContentId = mock?.qa_content_id || null;
          if (currentQaContentId !== qa.id) {
            if (options.execute) {
              await client.query(
                `
                UPDATE client_mock_calls
                SET qa_content_id = $2
                WHERE id = $1
                `,
                [mockCallId, qa.id]
              );
            }

            if (mock) {
              mock.qa_content_id = qa.id;
              existingMockByLeadAndClient.set(pairKey, mock);
            }
            stats.mockCallsLinkedToQa += 1;
          }
        }
      }
    }

    if (options.execute) {
      await client.query("COMMIT");
    }

    console.log("\n[PushSampleCalls] Complete");
    console.log(`  Clients processed: ${stats.clients}`);
    console.log(`  Leads requested: ${stats.leadsRequested}`);
    console.log(`  Leads found: ${stats.leadsFound}`);
    console.log(`  Missing leads: ${stats.missingLeads}`);
    console.log(`  Lead-client pairs processed: ${stats.candidatePairs}`);
    console.log(`  Existing sample calls: ${stats.existingSampleCalls}`);
    console.log(`  Sample calls created: ${stats.sampleCallsCreated}`);
    console.log(`  QA records created: ${stats.qaCreated}`);
    console.log(`  QA records updated to published: ${stats.qaUpdated}`);
    console.log(`  Mock calls linked to QA records: ${stats.mockCallsLinkedToQa}`);
    console.log(`  Client visibility settings updated: ${stats.visibilityUpdated}`);
    console.log(`  Mode: ${options.execute ? "EXECUTE" : "DRY RUN"}`);
  } catch (error) {
    if (options.execute) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("[PushSampleCalls] Rollback failed:", rollbackError);
      }
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[PushSampleCalls] Failed:", error);
  process.exit(1);
});
