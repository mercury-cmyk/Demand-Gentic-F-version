import { db } from "../db";
import { 
  verificationContacts, 
  verificationCampaigns,
  verificationSuppressionList,
  type VerificationContact,
  type VerificationCampaign
} from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { evaluateEligibility } from "../lib/verification-utils";

export interface EligibilityScreeningResult {
  total: number;
  eligible: number;
  ineligible: number;
  suppressed: number;
  outOfScope: number;
  details: {
    contactId: string;
    status: string;
    reason: string;
  }[];
}

export async function screenCampaignEligibility(
  campaignId: string
): Promise {
  const campaign = await db.query.verificationCampaigns.findFirst({
    where: eq(verificationCampaigns.id, campaignId)
  });

  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  const contacts = await db.query.verificationContacts.findMany({
    where: and(
      eq(verificationContacts.campaignId, campaignId),
      eq(verificationContacts.deleted, false)
    )
  });

  if (contacts.length === 0) {
    return {
      total: 0,
      eligible: 0,
      ineligible: 0,
      suppressed: 0,
      outOfScope: 0,
      details: []
    };
  }

  const contactIds = contacts.map(c => c.id);
  const suppressionData = await checkSuppressions(campaignId, contacts);

  const results: {
    contactId: string;
    status: string;
    reason: string;
    update: any;
  }[] = [];

  let eligible = 0;
  let ineligible = 0;
  let suppressed = 0;
  let outOfScope = 0;

  for (const contact of contacts) {
    const isSuppressed = suppressionData.has(contact.id);
    
    if (isSuppressed) {
      results.push({
        contactId: contact.id,
        status: 'Suppressed',
        reason: suppressionData.get(contact.id) || 'matched_suppression_list',
        update: {
          suppressed: true,
          eligibilityStatus: 'Out_of_Scope',
          eligibilityReason: suppressionData.get(contact.id) || 'matched_suppression_list'
        }
      });
      suppressed++;
      continue;
    }

    const eligibilityResult = evaluateEligibility(
      contact.title,
      contact.contactCountry,
      campaign,
      contact.email
    );

    if (eligibilityResult.status === 'Eligible') {
      eligible++;
    } else {
      if (eligibilityResult.status === 'Out_of_Scope') {
        outOfScope++;
      } else {
        ineligible++;
      }
    }

    results.push({
      contactId: contact.id,
      status: eligibilityResult.status,
      reason: eligibilityResult.reason,
      update: {
        eligibilityStatus: eligibilityResult.status,
        eligibilityReason: eligibilityResult.reason,
        suppressed: false
      }
    });
  }

  await batchUpdateEligibility(results);

  return {
    total: contacts.length,
    eligible,
    ineligible,
    suppressed,
    outOfScope,
    details: results.map(r => ({
      contactId: r.contactId,
      status: r.status,
      reason: r.reason
    }))
  };
}

async function checkSuppressions(
  campaignId: string,
  contacts: VerificationContact[]
): Promise> {
  const campaign = await db.query.verificationCampaigns.findFirst({
    where: eq(verificationCampaigns.id, campaignId)
  });

  if (!campaign) {
    return new Map();
  }

  const suppressionMatchFields = campaign.suppressionMatchFields || ['email_lower'];
  const suppressionMap = new Map();

  const suppressionList = await db.query.verificationSuppressionList.findMany({
    where: eq(verificationSuppressionList.campaignId, campaignId)
  });

  if (suppressionList.length === 0) {
    return suppressionMap;
  }

  const suppressionEmails = new Set(
    suppressionList
      .filter(s => s.emailLower)
      .map(s => s.emailLower!)
  );

  const suppressionCavIds = new Set(
    suppressionList
      .filter(s => s.cavId)
      .map(s => s.cavId!)
  );

  const suppressionCavUserIds = new Set(
    suppressionList
      .filter(s => s.cavUserId)
      .map(s => s.cavUserId!)
  );

  const suppressionHashes = new Set(
    suppressionList
      .filter(s => s.nameCompanyHash)
      .map(s => s.nameCompanyHash!)
  );

  for (const contact of contacts) {
    let matchReason: string | null = null;

    if (suppressionMatchFields.includes('email_lower') && contact.emailLower) {
      if (suppressionEmails.has(contact.emailLower)) {
        matchReason = 'suppression_email_match';
      }
    }

    if (suppressionMatchFields.includes('cav_id') && contact.cavId) {
      if (suppressionCavIds.has(contact.cavId)) {
        matchReason = 'suppression_cav_id_match';
      }
    }

    if (suppressionMatchFields.includes('cav_user_id') && contact.cavUserId) {
      if (suppressionCavUserIds.has(contact.cavUserId)) {
        matchReason = 'suppression_cav_user_id_match';
      }
    }

    if (suppressionMatchFields.includes('name_company_hash') && contact.nameCompanyHash) {
      if (suppressionHashes.has(contact.nameCompanyHash)) {
        matchReason = 'suppression_hash_match';
      }
    }

    if (matchReason) {
      suppressionMap.set(contact.id, matchReason);
    }
  }

  return suppressionMap;
}

async function batchUpdateEligibility(
  results: { contactId: string; update: any }[]
): Promise {
  const BATCH_SIZE = 100;

  for (let i = 0; i  {
        await db
          .update(verificationContacts)
          .set({
            ...update,
            updatedAt: new Date()
          })
          .where(eq(verificationContacts.id, contactId));
      })
    );
  }
}

export async function getEligibilityStats(campaignId: string): Promise {
  const stats = await db
    .select({
      eligibilityStatus: verificationContacts.eligibilityStatus,
      suppressed: verificationContacts.suppressed,
      count: sql`count(*)::int`
    })
    .from(verificationContacts)
    .where(
      and(
        eq(verificationContacts.campaignId, campaignId),
        eq(verificationContacts.deleted, false)
      )
    )
    .groupBy(verificationContacts.eligibilityStatus, verificationContacts.suppressed);

  let total = 0;
  let eligible = 0;
  let ineligible = 0;
  let suppressed = 0;
  let outOfScope = 0;

  for (const row of stats) {
    const count = row.count || 0;
    total += count;

    if (row.suppressed) {
      suppressed += count;
    } else if (row.eligibilityStatus === 'Eligible') {
      eligible += count;
    } else if (row.eligibilityStatus === 'Out_of_Scope') {
      outOfScope += count;
    } else {
      ineligible += count;
    }
  }

  return {
    total,
    eligible,
    ineligible,
    suppressed,
    outOfScope
  };
}