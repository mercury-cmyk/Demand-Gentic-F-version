import fs from "node:fs";
import path from "node:path";
import { pool } from "../server/db";

type Options = {
  file: string;
  out: string;
};

type CsvRow = {
  leadId: string;
};

type AnalysisRow = {
  leadId: string;
  contactName: string;
  campaignName: string;
  qaStatus: string;
  convq: number | null;
  threshold: number;
  campaignAlignment: number | null;
  expectedDisposition: string | null;
  assignedDisposition: string | null;
  qualificationMet: boolean;
  meetsScore: boolean;
  meetsAlignment: boolean;
  hasSuccessSignal: boolean;
  verdict: "strong_success" | "score_success" | "borderline" | "below_campaign_criteria";
  successCriteria: string | null;
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  let file = "qa_leads_convq_60_plus.csv";
  let out = "campaign_success_analysis.csv";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--file" && next) {
      file = next;
      i += 1;
      continue;
    }
    if (arg === "--out" && next) {
      out = next;
      i += 1;
      continue;
    }
  }

  return { file, out };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function parseCsv(filePath: string): CsvRow[] {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const leadId = (cols[0] || "").trim();
    if (leadId) rows.push({ leadId });
  }

  const dedup = new Map<string, CsvRow>();
  for (const row of rows) dedup.set(row.leadId, row);
  return Array.from(dedup.values());
}

function csvSafe(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstNumber(obj: any, keys: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const nested = firstNumber(value, keys);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function inferThreshold(qaParameters: any): number {
  const candidate = firstNumber(qaParameters, ["min_score", "minScore", "minimum_score", "minimumScore"]);
  if (candidate !== null) return Math.max(0, Math.min(100, Math.round(candidate)));
  return 70;
}

function inferAlignmentThreshold(qaParameters: any): number {
  const candidate = firstNumber(qaParameters, [
    "min_campaign_alignment",
    "minCampaignAlignment",
    "campaign_alignment_min",
    "campaignAlignmentMin",
  ]);
  if (candidate !== null) return Math.max(0, Math.min(100, Math.round(candidate)));
  return 70;
}

function hasPositiveDisposition(expectedDisposition: string | null, assignedDisposition: string | null): boolean {
  const source = `${expectedDisposition || ""} ${assignedDisposition || ""}`.toLowerCase();
  if (!source.trim()) return false;

  const negative = ["not_interested", "no_answer", "voicemail", "do_not_call", "invalid_data", "wrong_number"];
  if (negative.some((n) => source.includes(n))) return false;

  const positive = [
    "qualified",
    "lead",
    "interested",
    "meeting",
    "demo",
    "callback",
    "success",
    "whitepaper",
    "consent",
    "information",
  ];
  return positive.some((p) => source.includes(p));
}

async function main() {
  const options = parseArgs();
  const filePath = path.resolve(process.cwd(), options.file);
  const outPath = path.resolve(process.cwd(), options.out);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Input CSV not found: ${filePath}`);
  }

  const csvRows = parseCsv(filePath);
  if (csvRows.length === 0) {
    throw new Error(`No lead IDs found in ${options.file}`);
  }

  const leadIds = csvRows.map((r) => r.leadId);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
        SELECT
          l.id AS lead_id,
          COALESCE(l.contact_name, c.full_name, TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), 'Unknown') AS contact_name,
          camp.name AS campaign_name,
          l.qa_status,
          l.ai_score,
          camp.qa_parameters,
          camp.success_criteria,
          q.campaign_alignment_score,
          q.expected_disposition,
          q.assigned_disposition,
          q.qualification_met,
          q.clarity_score,
          q.engagement_score,
          q.empathy_score,
          q.objection_handling_score,
          q.qualification_score,
          q.closing_score
        FROM leads l
        LEFT JOIN contacts c ON c.id = l.contact_id
        LEFT JOIN campaigns camp ON camp.id = l.campaign_id
        LEFT JOIN LATERAL (
          SELECT
            cqr.campaign_alignment_score,
            cqr.expected_disposition,
            cqr.assigned_disposition,
            cqr.qualification_met,
            cqr.clarity_score,
            cqr.engagement_score,
            cqr.empathy_score,
            cqr.objection_handling_score,
            cqr.qualification_score,
            cqr.closing_score,
            cqr.created_at
          FROM call_quality_records cqr
          LEFT JOIN call_sessions cs ON cs.id = cqr.call_session_id
          WHERE
            (l.telnyx_call_id IS NOT NULL AND cs.telnyx_call_id = l.telnyx_call_id)
            OR (l.contact_id IS NOT NULL AND l.campaign_id IS NOT NULL AND cqr.contact_id = l.contact_id AND cqr.campaign_id = l.campaign_id)
          ORDER BY
            CASE WHEN l.telnyx_call_id IS NOT NULL AND cs.telnyx_call_id = l.telnyx_call_id THEN 0 ELSE 1 END,
            cqr.created_at DESC
          LIMIT 1
        ) q ON TRUE
        WHERE l.id = ANY($1::varchar[])
          AND l.deleted_at IS NULL
      `,
      [leadIds]
    );

    const rowsById = new Map<string, any>();
    for (const row of result.rows) rowsById.set(row.lead_id, row);

    const analyses: AnalysisRow[] = [];
    for (const id of leadIds) {
      const row = rowsById.get(id);
      if (!row) continue;

      const qaParameters = row.qa_parameters || null;
      const threshold = inferThreshold(qaParameters);
      const alignmentThreshold = inferAlignmentThreshold(qaParameters);

      let convq = numOrNull(row.ai_score);
      if (convq === null) {
        const clarity = numOrNull(row.clarity_score) ?? 0;
        const engagement = numOrNull(row.engagement_score) ?? 0;
        const empathy = numOrNull(row.empathy_score) ?? 0;
        const objection = numOrNull(row.objection_handling_score) ?? 0;
        const qualification = numOrNull(row.qualification_score) ?? 0;
        const closing = numOrNull(row.closing_score) ?? 0;
        convq = Math.round(
          clarity * 0.25 +
          engagement * 0.2 +
          empathy * 0.15 +
          objection * 0.15 +
          qualification * 0.15 +
          closing * 0.1
        );
      }

      const campaignAlignment = numOrNull(row.campaign_alignment_score);
      const qualificationMet = row.qualification_met === true;
      const hasSuccessSignal = qualificationMet || hasPositiveDisposition(row.expected_disposition, row.assigned_disposition);
      const meetsScore = convq !== null && convq >= threshold;
      const meetsAlignment = campaignAlignment === null ? true : campaignAlignment >= alignmentThreshold;

      let verdict: AnalysisRow["verdict"] = "below_campaign_criteria";
      if (meetsScore && meetsAlignment && hasSuccessSignal) verdict = "strong_success";
      else if (meetsScore && meetsAlignment) verdict = "score_success";
      else if (convq !== null && convq >= threshold - 5) verdict = "borderline";

      analyses.push({
        leadId: row.lead_id,
        contactName: row.contact_name || "Unknown",
        campaignName: row.campaign_name || "Unknown",
        qaStatus: row.qa_status || "unknown",
        convq,
        threshold,
        campaignAlignment,
        expectedDisposition: row.expected_disposition || null,
        assignedDisposition: row.assigned_disposition || null,
        qualificationMet,
        meetsScore,
        meetsAlignment,
        hasSuccessSignal,
        verdict,
        successCriteria: row.success_criteria || null,
      });
    }

    const header = [
      "lead_id",
      "contact_name",
      "campaign_name",
      "qa_status",
      "convq",
      "campaign_threshold",
      "campaign_alignment_score",
      "qualification_met",
      "expected_disposition",
      "assigned_disposition",
      "meets_score",
      "meets_alignment",
      "has_success_signal",
      "verdict",
      "campaign_success_criteria",
    ];

    const lines = [header.join(",")];
    for (const row of analyses) {
      lines.push([
        csvSafe(row.leadId),
        csvSafe(row.contactName),
        csvSafe(row.campaignName),
        csvSafe(row.qaStatus),
        csvSafe(row.convq),
        csvSafe(row.threshold),
        csvSafe(row.campaignAlignment),
        csvSafe(row.qualificationMet),
        csvSafe(row.expectedDisposition),
        csvSafe(row.assignedDisposition),
        csvSafe(row.meetsScore),
        csvSafe(row.meetsAlignment),
        csvSafe(row.hasSuccessSignal),
        csvSafe(row.verdict),
        csvSafe(row.successCriteria),
      ].join(","));
    }
    fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");

    const totals = {
      total: analyses.length,
      strongSuccess: analyses.filter((r) => r.verdict === "strong_success").length,
      scoreSuccess: analyses.filter((r) => r.verdict === "score_success").length,
      borderline: analyses.filter((r) => r.verdict === "borderline").length,
      belowCriteria: analyses.filter((r) => r.verdict === "below_campaign_criteria").length,
    };

    console.log("==============================================");
    console.log("CAMPAIGN SUCCESS ANALYSIS");
    console.log("==============================================");
    console.log(`Input rows: ${csvRows.length}`);
    console.log(`Analyzed leads: ${totals.total}`);
    console.log(`Strong success: ${totals.strongSuccess}`);
    console.log(`Score success: ${totals.scoreSuccess}`);
    console.log(`Borderline: ${totals.borderline}`);
    console.log(`Below campaign criteria: ${totals.belowCriteria}`);
    console.log(`Output CSV: ${options.out}`);
    console.log("");

    const byCampaign = new Map<string, { total: number; strong: number; score: number; border: number; fail: number }>();
    for (const row of analyses) {
      const key = row.campaignName;
      const current = byCampaign.get(key) || { total: 0, strong: 0, score: 0, border: 0, fail: 0 };
      current.total += 1;
      if (row.verdict === "strong_success") current.strong += 1;
      else if (row.verdict === "score_success") current.score += 1;
      else if (row.verdict === "borderline") current.border += 1;
      else current.fail += 1;
      byCampaign.set(key, current);
    }

    console.log("By campaign:");
    for (const [campaign, stats] of Array.from(byCampaign.entries()).sort((a, b) => b[1].total - a[1].total)) {
      console.log(
        `  ${campaign}: total=${stats.total}, strong=${stats.strong}, score=${stats.score}, borderline=${stats.border}, fail=${stats.fail}`
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
