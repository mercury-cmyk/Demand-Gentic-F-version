/**
 * Backfill Journey Pipelines for Existing Clients
 *
 * Creates pipelines and enrolls leads from historical campaign data:
 * 1. For each client account with campaigns, ensures an active pipeline exists
 * 2. Scans dialerCallAttempts for dispositions that should have been enrolled
 *    (callback_requested, voicemail, no_answer, needs_review, qualified_lead)
 * 3. Creates journey leads with proper stage placement based on disposition
 * 4. Creates initial follow-up actions (callback + email where applicable)
 *
 * Usage:
 *   npx tsx server/scripts/backfill-pipeline-for-clients.ts                  # All clients
 *   npx tsx server/scripts/backfill-pipeline-for-clients.ts <clientAccountId> # Single client
 *   npx tsx server/scripts/backfill-pipeline-for-clients.ts --dry-run        # Preview only
 *   npx tsx server/scripts/backfill-pipeline-for-clients.ts <id> --dry-run   # Preview single
 */

import { db } from "../db";
import {
  clientAccounts,
  campaigns,
  clientJourneyPipelines,
  clientJourneyLeads,
  clientJourneyActions,
  dialerCallAttempts,
  contacts,
  emailSends,
} from "@shared/schema";
import {
  eq,
  and,
  sql,
  inArray,
  isNotNull,
  desc,
  not,
} from "drizzle-orm";

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_STAGES = [
  { id: "new_lead", name: "New Lead", order: 0, color: "#3b82f6", defaultActionType: "callback" },
  { id: "callback_scheduled", name: "Callback Scheduled", order: 1, color: "#06b6d4", defaultActionType: "callback" },
  { id: "contacted", name: "Contacted", order: 2, color: "#f59e0b", defaultActionType: "email" },
  { id: "engaged", name: "Engaged", order: 3, color: "#8b5cf6", defaultActionType: "callback" },
  { id: "appointment_set", name: "Appointment Set", order: 4, color: "#10b981", defaultActionType: "note" },
  { id: "closed", name: "Closed", order: 5, color: "#6b7280", defaultActionType: "note" },
];

const DEFAULT_AUTO_ENROLL_DISPOSITIONS = [
  "voicemail",
  "callback_requested",
  "needs_review",
  "no_answer",
];

// Dispositions to backfill into the pipeline
const BACKFILL_DISPOSITIONS = [
  "callback_requested",
  "voicemail",
  "no_answer",
  "needs_review",
  "qualified_lead",
];

// Map disposition → pipeline stage
function dispositionToStage(disposition: string): string {
  switch (disposition) {
    case "callback_requested":
      return "callback_scheduled";
    case "qualified_lead":
      return "appointment_set";
    case "needs_review":
      return "new_lead";
    case "voicemail":
    case "no_answer":
    default:
      return "new_lead";
  }
}

// Map disposition → priority (1-5)
function dispositionToPriority(disposition: string): number {
  switch (disposition) {
    case "qualified_lead":
      return 5;
    case "callback_requested":
      return 5;
    case "needs_review":
      return 4;
    case "voicemail":
    case "no_answer":
      return 3;
    default:
      return 3;
  }
}

// ─── Stats ───────────────────────────────────────────────────────────────────

interface BackfillStats {
  clientsProcessed: number;
  pipelinesCreated: number;
  pipelinesExisted: number;
  leadsCreated: number;
  leadsSkippedDuplicate: number;
  leadsSkippedNoContact: number;
  actionsCreated: number;
  errors: string[];
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const targetClientId = args.find((a) => !a.startsWith("--")) || null;

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║    Pipeline Backfill for Existing Clients                ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`  Mode:   ${dryRun ? "🔍 DRY RUN (no changes)" : "🚀 LIVE"}`);
  console.log(`  Target: ${targetClientId || "ALL clients with campaigns"}`);
  console.log("");

  const stats: BackfillStats = {
    clientsProcessed: 0,
    pipelinesCreated: 0,
    pipelinesExisted: 0,
    leadsCreated: 0,
    leadsSkippedDuplicate: 0,
    leadsSkippedNoContact: 0,
    actionsCreated: 0,
    errors: [],
  };

  try {
    // 1. Find all client accounts that have campaigns
    const clientConditions = [eq(clientAccounts.isActive, true)];
    if (targetClientId) {
      clientConditions.push(eq(clientAccounts.id, targetClientId));
    }

    const clients = await db
      .select({
        id: clientAccounts.id,
        name: clientAccounts.name,
      })
      .from(clientAccounts)
      .where(and(...clientConditions));

    if (clients.length === 0) {
      console.log("⚠️  No matching client accounts found.");
      process.exit(0);
    }

    console.log(`Found ${clients.length} client account(s) to process.\n`);

    for (const client of clients) {
      console.log(`\n━━━ Processing: ${client.name} (${client.id}) ━━━`);

      // 2. Get campaigns for this client
      const clientCampaigns = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          type: campaigns.type,
          status: campaigns.status,
        })
        .from(campaigns)
        .where(eq(campaigns.clientAccountId, client.id));

      if (clientCampaigns.length === 0) {
        console.log("  ⏭  No campaigns found — skipping.");
        continue;
      }

      console.log(`  📋 Found ${clientCampaigns.length} campaign(s)`);
      stats.clientsProcessed += 1;

      // 3. Ensure pipeline exists
      const existingPipelines = await db
        .select()
        .from(clientJourneyPipelines)
        .where(
          and(
            eq(clientJourneyPipelines.clientAccountId, client.id),
            eq(clientJourneyPipelines.status, "active")
          )
        );

      let pipeline: typeof clientJourneyPipelines.$inferSelect;

      if (existingPipelines.length > 0) {
        pipeline = existingPipelines[0];
        console.log(`  ✅ Pipeline exists: "${pipeline.name}" (${pipeline.id})`);
        stats.pipelinesExisted += 1;
      } else {
        console.log(`  🆕 Creating default pipeline...`);
        if (!dryRun) {
          const [created] = await db
            .insert(clientJourneyPipelines)
            .values({
              clientAccountId: client.id,
              name: `${client.name} — Lead Pipeline`,
              description: `Auto-created pipeline for ${client.name}. Manages follow-ups from call and email campaigns.`,
              stages: DEFAULT_STAGES,
              autoEnrollDispositions: DEFAULT_AUTO_ENROLL_DISPOSITIONS,
              status: "active",
              leadCount: 0,
            })
            .returning();
          pipeline = created;
          console.log(`  ✅ Created pipeline: ${pipeline.id}`);
        } else {
          console.log(`  [DRY RUN] Would create pipeline "${client.name} — Lead Pipeline"`);
          pipeline = { id: "dry-run-id" } as any;
        }
        stats.pipelinesCreated += 1;
      }

      // 4. Find historical call attempts with backfill-eligible dispositions
      const campaignIds = clientCampaigns.map((c) => c.id);

      const callAttempts = await db
        .select({
          id: dialerCallAttempts.id,
          campaignId: dialerCallAttempts.campaignId,
          contactId: dialerCallAttempts.contactId,
          callSessionId: dialerCallAttempts.callSessionId,
          disposition: dialerCallAttempts.disposition,
          callDurationSeconds: dialerCallAttempts.callDurationSeconds,
          fullTranscript: dialerCallAttempts.fullTranscript,
          notes: dialerCallAttempts.notes,
          agentType: dialerCallAttempts.agentType,
          createdAt: dialerCallAttempts.createdAt,
        })
        .from(dialerCallAttempts)
        .where(
          and(
            inArray(dialerCallAttempts.campaignId, campaignIds),
            isNotNull(dialerCallAttempts.disposition),
            inArray(dialerCallAttempts.disposition, BACKFILL_DISPOSITIONS)
          )
        )
        .orderBy(desc(dialerCallAttempts.createdAt));

      console.log(`  📞 Found ${callAttempts.length} eligible call disposition(s)`);

      // 5. Deduplicate by contactId — keep the most recent attempt per contact
      const contactMap = new Map<
        string,
        (typeof callAttempts)[0]
      >();
      for (const attempt of callAttempts) {
        if (!attempt.contactId) continue;
        if (!contactMap.has(attempt.contactId)) {
          contactMap.set(attempt.contactId, attempt);
        }
      }

      console.log(`  👤 Unique contacts to enroll: ${contactMap.size}`);

      // 6. Enroll each contact
      let leadsCreatedForClient = 0;
      for (const [contactId, attempt] of contactMap) {
        try {
          // Check if already enrolled
          const [existing] = await db
            .select({ id: clientJourneyLeads.id })
            .from(clientJourneyLeads)
            .where(
              and(
                eq(clientJourneyLeads.pipelineId, pipeline.id),
                eq(clientJourneyLeads.contactId, contactId),
                inArray(clientJourneyLeads.status, ["active", "paused"])
              )
            )
            .limit(1);

          if (existing) {
            stats.leadsSkippedDuplicate += 1;
            continue;
          }

          // Get contact details
          const [contact] = await db
            .select({
              id: contacts.id,
              fullName: contacts.fullName,
              email: contacts.email,
              directPhoneE164: contacts.directPhoneE164,
              mobilePhoneE164: contacts.mobilePhoneE164,
              dialingPhoneE164: contacts.dialingPhoneE164,
              jobTitle: contacts.jobTitle,
              companyName: contacts.companyName,
            })
            .from(contacts)
            .where(eq(contacts.id, contactId))
            .limit(1);

          if (!contact) {
            stats.leadsSkippedNoContact += 1;
            continue;
          }

          const disposition = attempt.disposition || "no_answer";
          const stageId = dispositionToStage(disposition);
          const priority = dispositionToPriority(disposition);

          if (dryRun) {
            console.log(
              `    [DRY RUN] Would enroll: ${contact.fullName || contactId} → stage="${stageId}" (${disposition})`
            );
            stats.leadsCreated += 1;
            continue;
          }

          // Create lead
          const [lead] = await db
            .insert(clientJourneyLeads)
            .values({
              pipelineId: pipeline.id,
              contactId: contact.id,
              contactName: contact.fullName || null,
              contactEmail: contact.email || null,
              contactPhone:
                contact.dialingPhoneE164 ||
                contact.directPhoneE164 ||
                contact.mobilePhoneE164 ||
                null,
              companyName: contact.companyName || null,
              jobTitle: contact.jobTitle || null,
              sourceCallSessionId: attempt.callSessionId || null,
              sourceCampaignId: attempt.campaignId,
              sourceDisposition: disposition,
              sourceCallSummary: attempt.notes || null,
              sourceAiAnalysis: {
                backfilled: true,
                backfilledAt: new Date().toISOString(),
                callAttemptId: attempt.id,
                callDurationSeconds: attempt.callDurationSeconds,
                agentType: attempt.agentType,
                originalDisposition: disposition,
              },
              currentStageId: stageId,
              status: "active",
              priority,
              metadata: {
                autoEnrolled: true,
                autoEnrolledAt: new Date().toISOString(),
                autoEnrolledDisposition: disposition,
                backfilled: true,
              },
            })
            .returning();

          leadsCreatedForClient += 1;
          stats.leadsCreated += 1;

          // Create follow-up actions
          let actionsForLead = 0;

          // Callback action (for callback_requested, needs_review, voicemail, no_answer)
          if (disposition !== "qualified_lead") {
            const callbackAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
            await db.insert(clientJourneyActions).values({
              journeyLeadId: lead.id,
              pipelineId: pipeline.id,
              actionType: "callback",
              status: "scheduled",
              scheduledAt: callbackAt,
              title: `Backfill: follow-up call (${disposition})`,
              description: `Auto-created during pipeline backfill. Original disposition: ${disposition}. Review lead context before calling.`,
              aiGeneratedContext: {
                disposition,
                backfilled: true,
                sourceSummary: attempt.notes || null,
                objective: "Re-engage prospect based on historical campaign interaction.",
              },
              previousActivitySummary: attempt.notes || `Previous ${disposition} from campaign.`,
            });
            actionsForLead += 1;
            stats.actionsCreated += 1;
          }

          // Email action (if contact has email)
          if (contact.email) {
            const emailAt = new Date(Date.now() + 90 * 60 * 1000); // 1.5 hours from now
            await db.insert(clientJourneyActions).values({
              journeyLeadId: lead.id,
              pipelineId: pipeline.id,
              actionType: "email",
              status: "scheduled",
              scheduledAt: emailAt,
              title: `Backfill: follow-up email (${disposition})`,
              description: `Auto-created during pipeline backfill. Send contextual follow-up email.`,
              aiGeneratedContext: {
                disposition,
                backfilled: true,
                intent: disposition === "qualified_lead" ? "meeting_confirmation" : "reinforce_callback",
              },
              previousActivitySummary: attempt.notes || `Previous ${disposition} from campaign.`,
            });
            actionsForLead += 1;
            stats.actionsCreated += 1;
          }

          // Update lead's next action + total actions
          if (actionsForLead > 0) {
            const nextActionAt = new Date(Date.now() + 60 * 60 * 1000);
            await db
              .update(clientJourneyLeads)
              .set({
                nextActionType: "callback",
                nextActionAt,
                totalActions: actionsForLead,
                updatedAt: new Date(),
              })
              .where(eq(clientJourneyLeads.id, lead.id));
          }
        } catch (error: any) {
          const msg = `Failed to enroll contact ${contactId}: ${error.message}`;
          console.error(`    ❌ ${msg}`);
          stats.errors.push(msg);
        }
      }

      // 7. Update pipeline lead count
      if (!dryRun && leadsCreatedForClient > 0) {
        await db
          .update(clientJourneyPipelines)
          .set({
            leadCount: sql`${clientJourneyPipelines.leadCount} + ${leadsCreatedForClient}`,
            updatedAt: new Date(),
          })
          .where(eq(clientJourneyPipelines.id, pipeline.id));
      }

      console.log(`  ✅ Enrolled ${leadsCreatedForClient} leads for ${client.name}`);

      // 8. Also check email sends for contacts not yet enrolled
      const emailContacts = await db
        .select({
          contactId: emailSends.contactId,
          campaignId: emailSends.campaignId,
        })
        .from(emailSends)
        .where(inArray(emailSends.campaignId, campaignIds))
        .orderBy(desc(emailSends.createdAt));

      // Deduplicate
      const emailContactMap = new Map<string, { campaignId: string }>();
      for (const es of emailContacts) {
        if (!emailContactMap.has(es.contactId)) {
          emailContactMap.set(es.contactId, { campaignId: es.campaignId });
        }
      }

      // Filter out contacts already enrolled from call dispositions
      let emailOnlyEnrolled = 0;
      for (const [contactId, { campaignId }] of emailContactMap) {
        if (contactMap.has(contactId)) continue; // Already handled

        // Check if already enrolled
        const [existing] = await db
          .select({ id: clientJourneyLeads.id })
          .from(clientJourneyLeads)
          .where(
            and(
              eq(clientJourneyLeads.pipelineId, pipeline.id),
              eq(clientJourneyLeads.contactId, contactId),
              inArray(clientJourneyLeads.status, ["active", "paused"])
            )
          )
          .limit(1);

        if (existing) {
          stats.leadsSkippedDuplicate += 1;
          continue;
        }

        const [contact] = await db
          .select({
            id: contacts.id,
            fullName: contacts.fullName,
            email: contacts.email,
            directPhoneE164: contacts.directPhoneE164,
            mobilePhoneE164: contacts.mobilePhoneE164,
            dialingPhoneE164: contacts.dialingPhoneE164,
            jobTitle: contacts.jobTitle,
            companyName: contacts.companyName,
          })
          .from(contacts)
          .where(eq(contacts.id, contactId))
          .limit(1);

        if (!contact) {
          stats.leadsSkippedNoContact += 1;
          continue;
        }

        if (dryRun) {
          console.log(
            `    [DRY RUN] Would enroll email contact: ${contact.fullName || contactId} → stage="new_lead"`
          );
          stats.leadsCreated += 1;
          emailOnlyEnrolled += 1;
          continue;
        }

        try {
          const [lead] = await db
            .insert(clientJourneyLeads)
            .values({
              pipelineId: pipeline.id,
              contactId: contact.id,
              contactName: contact.fullName || null,
              contactEmail: contact.email || null,
              contactPhone:
                contact.dialingPhoneE164 ||
                contact.directPhoneE164 ||
                contact.mobilePhoneE164 ||
                null,
              companyName: contact.companyName || null,
              jobTitle: contact.jobTitle || null,
              sourceCampaignId: campaignId,
              sourceDisposition: "email_sent",
              currentStageId: "new_lead",
              status: "active",
              priority: 2,
              metadata: {
                autoEnrolled: true,
                autoEnrolledAt: new Date().toISOString(),
                enrollmentSource: "email_campaign_backfill",
                backfilled: true,
              },
            })
            .returning();

          // Schedule follow-up email
          if (contact.email) {
            const emailAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
            await db.insert(clientJourneyActions).values({
              journeyLeadId: lead.id,
              pipelineId: pipeline.id,
              actionType: "email",
              status: "scheduled",
              scheduledAt: emailAt,
              title: "Backfill: follow-up email (email campaign contact)",
              description: "Contact was reached via email campaign. Schedule follow-up.",
              aiGeneratedContext: {
                backfilled: true,
                intent: "initial_followup",
              },
            });
            stats.actionsCreated += 1;

            await db
              .update(clientJourneyLeads)
              .set({
                nextActionType: "email",
                nextActionAt: emailAt,
                totalActions: 1,
                updatedAt: new Date(),
              })
              .where(eq(clientJourneyLeads.id, lead.id));
          }

          emailOnlyEnrolled += 1;
          stats.leadsCreated += 1;
        } catch (error: any) {
          stats.errors.push(`Email contact ${contactId}: ${error.message}`);
        }
      }

      if (emailOnlyEnrolled > 0) {
        if (!dryRun) {
          await db
            .update(clientJourneyPipelines)
            .set({
              leadCount: sql`${clientJourneyPipelines.leadCount} + ${emailOnlyEnrolled}`,
              updatedAt: new Date(),
            })
            .where(eq(clientJourneyPipelines.id, pipeline.id));
        }
        console.log(`  📧 Enrolled ${emailOnlyEnrolled} email-only contacts`);
      }
    }
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    stats.errors.push(`Fatal: ${error.message}`);
  }

  // ─── Summary ───────────────────────────────────────────────────────────────

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║    Backfill Summary                                     ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`  ${dryRun ? "[DRY RUN] " : ""}Clients processed:    ${stats.clientsProcessed}`);
  console.log(`  Pipelines created:       ${stats.pipelinesCreated}`);
  console.log(`  Pipelines already exist: ${stats.pipelinesExisted}`);
  console.log(`  Leads created:           ${stats.leadsCreated}`);
  console.log(`  Leads skipped (dup):     ${stats.leadsSkippedDuplicate}`);
  console.log(`  Leads skipped (no data): ${stats.leadsSkippedNoContact}`);
  console.log(`  Actions created:         ${stats.actionsCreated}`);

  if (stats.errors.length > 0) {
    console.log(`\n  ⚠️  Errors (${stats.errors.length}):`);
    for (const err of stats.errors.slice(0, 20)) {
      console.log(`    - ${err}`);
    }
    if (stats.errors.length > 20) {
      console.log(`    ... and ${stats.errors.length - 20} more`);
    }
  }

  console.log("");
  process.exit(stats.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
