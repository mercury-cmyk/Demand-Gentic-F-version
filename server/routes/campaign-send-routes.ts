/**
 * Campaign Send Routes
 *
 * Handles triggering the actual bulk sending of email campaigns
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { campaigns, contacts, senderProfiles, lists, segments } from "../../shared/schema";
import { eq, and, inArray, or, isNull } from "drizzle-orm";
import { sendBulkEmails, type BulkEmailRecipient } from "../services/bulk-email-service";
import { buildFilterQuery } from "../filter-builder";
import type { FilterGroup } from "@shared/filter-types";
import { campaignEmailProviderService } from "../services/campaign-email-provider-service";

const router = Router();

/**
 * POST /api/campaigns/:id/send
 * Trigger bulk send of an email campaign
 */
router.post("/:id/send", async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.id;

    // Get campaign details
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({
        error: "Campaign not found",
        message: `Campaign ${campaignId} does not exist`,
      });
    }

    // Validate campaign has required email content
    if (!campaign.emailSubject || !campaign.emailHtmlContent) {
      return res.status(400).json({
        error: "incomplete_campaign",
        message: "Campaign must have email subject and content before sending",
      });
    }

    // Get sender profile - use campaign's profile or the default active profile
    let senderProfile;

    // @ts-ignore - senderProfileId may not exist on campaign
    if (campaign.senderProfileId) {
      // @ts-ignore
      [senderProfile] = await db
        .select()
        .from(senderProfiles)
        // @ts-ignore
        .where(eq(senderProfiles.id, campaign.senderProfileId))
        .limit(1);
    }

    // If no sender profile specified, use the default active profile
    if (!senderProfile) {
      console.log('[Campaign Send] No sender profile on campaign, selecting default active sender profile');

      const profiles = await db
        .select()
        .from(senderProfiles)
        .limit(10);
      
      console.log('[Campaign Send] Available profiles:', profiles.map(p => ({ 
        id: p.id, 
        email: p.fromEmail, 
        espAdapter: p.espAdapter, 
        isVerified: p.isVerified 
      })));

      senderProfile = profiles.find(p => p.isDefault && p.isActive !== false)
        || profiles.find(p => p.isActive !== false)
        || profiles[0];
    }

    if (!senderProfile) {
      return res.status(400).json({
        error: "no_sender_profile",
        message: "No sender profile configured for this campaign",
      });
    }
    
    console.log('[Campaign Send] Using sender profile:', {
      id: senderProfile.id,
      email: senderProfile.fromEmail,
      espAdapter: senderProfile.espAdapter,
      isVerified: senderProfile.isVerified
    });

    const campaignProvider = await campaignEmailProviderService.resolveCampaignEmailProviderForSenderProfile(senderProfile);

    // Skip verification check when an external campaign email provider is bound or resolved.
    // Domain verification is handled through the provider and domain management flow.
    const hasEspAdapter = !!senderProfile.espAdapter;
    const hasCampaignProvider = !!campaignProvider;
    const isLocallyVerified = senderProfile.isVerified === true;
    
    if (!isLocallyVerified && !hasEspAdapter && !hasCampaignProvider) {
      return res.status(400).json({
        error: "sender_not_verified",
        message: `Sender profile "${senderProfile.fromEmail}" is not verified`,
      });
    }
    
    // Log ESP profile usage
    if (hasEspAdapter || hasCampaignProvider) {
      console.log(`[Campaign Send] Using ${campaignProvider?.providerKey || senderProfile.espAdapter} sender ${senderProfile.fromEmail} (domain verified with external provider)`);
    }
    console.log('[Campaign Send] Resolved campaign email provider:', {
      id: campaignProvider?.id || null,
      providerKey: campaignProvider?.providerKey || senderProfile.espProvider || senderProfile.espAdapter || 'mailgun',
      name: campaignProvider?.name || null,
    });

    console.log(`[Campaign Send] Fetching audience for campaign ${campaignId}`);

    // Fetch campaign audience using proper audience resolution with INTERSECTION logic
    // When a list/segment has additional filters, the filters narrow down (intersect) the list contacts
    // @ts-ignore - audienceRefs may not exist
    const audienceRefs = campaign.audienceRefs as any;
    let campaignContacts: any[] = [];

    const hasFilterGroup = audienceRefs?.filterGroup?.conditions?.length > 0;
    const listIds = audienceRefs?.lists || audienceRefs?.selectedLists || [];
    const hasLists = listIds.length > 0;
    const segmentIds = audienceRefs?.segments || audienceRefs?.selectedSegments || [];
    const hasSegments = segmentIds.length > 0;
    const hasAllContacts = audienceRefs?.allContacts === true;

    // Step 1: Collect contact IDs from filter group
    let filterContactIds: Set<string> | null = null;
    if (hasFilterGroup) {
      filterContactIds = new Set<string>();
      console.log(`[Campaign Send] Resolving contacts from filterGroup for campaign ${campaignId}`);
      const filterSQL = buildFilterQuery(audienceRefs.filterGroup as FilterGroup, contacts);
      if (filterSQL) {
        const audienceContacts = await db.select({ id: contacts.id })
          .from(contacts)
          .where(filterSQL);
        audienceContacts.forEach(c => filterContactIds!.add(c.id));
        console.log(`[Campaign Send] FilterGroup resolved ${filterContactIds.size} contacts`);
      }
    }

    // Step 2: Collect contact IDs from lists and segments
    let sourceContactIds: Set<string> | null = null;

    if (hasLists) {
      sourceContactIds = sourceContactIds || new Set<string>();
      console.log(`[Campaign Send] Resolving contacts from ${listIds.length} lists`);
      for (const listId of listIds) {
        const [list] = await db.select()
          .from(lists)
          .where(eq(lists.id, listId))
          .limit(1);
        if (list && list.recordIds && Array.isArray(list.recordIds) && list.recordIds.length > 0) {
          list.recordIds.forEach((id: string) => sourceContactIds!.add(id));
        }
      }
      console.log(`[Campaign Send] Lists resolved ${sourceContactIds.size} contacts`);
    }

    if (hasSegments) {
      sourceContactIds = sourceContactIds || new Set<string>();
      console.log(`[Campaign Send] Resolving contacts from ${segmentIds.length} segments`);
      for (const segmentId of segmentIds) {
        const [segment] = await db.select()
          .from(segments)
          .where(eq(segments.id, segmentId))
          .limit(1);
        if (segment && segment.definitionJson) {
          const filterSQL = buildFilterQuery(segment.definitionJson as FilterGroup, contacts);
          if (filterSQL) {
            const segmentContacts = await db.select({ id: contacts.id })
              .from(contacts)
              .where(filterSQL);
            segmentContacts.forEach(c => sourceContactIds!.add(c.id));
          }
        }
      }
      console.log(`[Campaign Send] Lists+Segments resolved ${sourceContactIds.size} contacts total`);
    }

    if (hasAllContacts) {
      sourceContactIds = sourceContactIds || new Set<string>();
      console.log(`[Campaign Send] Resolving ALL contacts for campaign ${campaignId}`);
      const allContacts = await db.select({ id: contacts.id })
        .from(contacts);
      allContacts.forEach(c => sourceContactIds!.add(c.id));
      console.log(`[Campaign Send] All contacts resolved: ${allContacts.length} contacts`);
    }

    // Step 3: Combine using INTERSECTION when both filters and sources exist
    let uniqueContactIds: Set<string>;
    if (filterContactIds && sourceContactIds) {
      // INTERSECTION: contacts must match filters AND be in list/segment
      uniqueContactIds = new Set(
        [...sourceContactIds].filter(id => filterContactIds!.has(id))
      );
      console.log(`[Campaign Send] Intersection: ${sourceContactIds.size} source contacts INTERSECT ${filterContactIds.size} filter contacts = ${uniqueContactIds.size}`);
    } else if (filterContactIds) {
      // Standalone filters (no list/segment selected)
      uniqueContactIds = filterContactIds;
    } else if (sourceContactIds) {
      // List/segment without additional filters
      uniqueContactIds = sourceContactIds;
    } else {
      uniqueContactIds = new Set<string>();
    }

    // Convert contact IDs to full contact objects (with batching for large datasets)
    if (uniqueContactIds.size > 0) {
      const contactIdsArray = Array.from(uniqueContactIds);
      console.log(`[Campaign Send] Fetching ${contactIdsArray.length} unique contacts`);
      const batchSize = 500;

      for (let i = 0; i < contactIdsArray.length; i += batchSize) {
        const batch = contactIdsArray.slice(i, i + batchSize);
        // First fetch all contacts without email validation filter
        const allBatchContacts = await db.select()
          .from(contacts)
          .where(inArray(contacts.id, batch));
        
        // Filter for deliverable emails - allow null/empty, 'valid', 'acceptable', or 'unknown' emailStatus
        // Note: 'unknown' means email has not been validated yet, which is acceptable for sending
        const validBatchContacts = allBatchContacts.filter(c => {
          const status = c.emailStatus;
          return !status || status === 'valid' || status === 'acceptable' || status === 'unknown';
        });
        
        console.log(`[Campaign Send] Batch ${Math.floor(i/batchSize) + 1}: ${allBatchContacts.length} total, ${validBatchContacts.length} with valid email status`);
        
        if (allBatchContacts.length > 0 && validBatchContacts.length === 0) {
          // Log sample of email statuses to debug
          const statusSample = allBatchContacts.slice(0, 5).map(c => ({ id: c.id, emailStatus: c.emailStatus }));
          console.log(`[Campaign Send] Sample email statuses:`, statusSample);
        }
        
        campaignContacts.push(...validBatchContacts);
      }
    }

    // If no audience defined at all, return error instead of sending to all contacts
    if (uniqueContactIds.size === 0) {
      console.log(`[Campaign Send] No audience defined for campaign ${campaignId}`);
      return res.status(400).json({
        error: "no_audience",
        message: "Campaign does not have any audience defined (no filters, lists, or segments)",
      });
    }

    if (campaignContacts.length === 0) {
      await db
        .update(campaigns)
        .set({ status: "draft" })
        .where(eq(campaigns.id, campaignId));

      return res.status(400).json({
        error: "no_recipients",
        message: "No valid recipients found in campaign audience",
      });
    }

    console.log(`[Campaign Send] Found ${campaignContacts.length} recipients`);

    // Prepare recipients for bulk send
    const recipients: BulkEmailRecipient[] = campaignContacts
      .filter(c => c.email) // Ensure email exists
      .map(contact => ({
        email: contact.email!,
        contactId: contact.id,
        customVariables: {
          first_name: contact.firstName || '',
          last_name: contact.lastName || '',
          company: contact.company || '',
          job_title: contact.jobTitle || '',
        },
      }));

    // Send emails using bulk service
    const result = await sendBulkEmails({
      campaignId,
      senderProfileId: senderProfile.id,
      from: senderProfile.fromEmail,
      fromName: senderProfile.fromName,
      replyTo: senderProfile.replyToEmail || senderProfile.fromEmail,
      subject: campaign.emailSubject,
      html: campaign.emailHtmlContent,
      // @ts-ignore - emailPreheader may not exist
      preheader: campaign.emailPreheader || undefined,
      text: undefined, // campaigns table doesn't have text content field
      recipients,
      tags: ['campaign', `campaign-${campaignId}`],
      providerId: campaignProvider?.id,
      providerKey: campaignProvider?.providerKey || senderProfile.espProvider || senderProfile.espAdapter || 'mailgun',
      espAdapter: senderProfile.espAdapter || 'mailgun',
      batchSize: 100,
      delayBetweenBatches: 1000,
    });

    // Update campaign status to completed if all sent
    await db
      .update(campaigns)
      .set({
        status: result.failed === 0 ? "completed" : "active",
      })
      .where(eq(campaigns.id, campaignId));

    console.log(`[Campaign Send] Completed: ${result.sent} sent, ${result.failed} failed, ${result.suppressed} suppressed`);

    return res.json({
      success: true,
      campaignId,
      result: {
        total: result.total,
        sent: result.sent,
        failed: result.failed,
        suppressed: result.suppressed,
        errors: result.errors,
      },
      message: `Campaign sent to ${result.sent} recipients`,
    });
  } catch (error: any) {
    console.error(`[Campaign Send] Error:`, error);

    // Try to update campaign status back to draft on error
    try {
      await db
        .update(campaigns)
        .set({ status: "draft" })
        .where(eq(campaigns.id, req.params.id));
    } catch (updateError) {
      console.error(`[Campaign Send] Failed to reset campaign status:`, updateError);
    }

    return res.status(500).json({
      error: "send_failed",
      message: error.message || "Failed to send campaign",
    });
  }
});

export default router;
