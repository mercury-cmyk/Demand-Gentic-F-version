import { db } from "../db";
import { 
  verificationContacts, 
  addressEnrichmentStatusEnum,
  phoneEnrichmentStatusEnum,
  type VerificationContact
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { 
  hasMatchingAddress, 
  hasMatchingPhone,
  getEnrichmentNeeds
} from "../lib/verification-data-completeness";

export interface ExistingDataCheckResult {
  total: number;
  addressComplete: number;
  phoneComplete: number;
  needsAddressEnrichment: number;
  needsPhoneEnrichment: number;
  needsBothEnrichment: number;
  fullyComplete: number;
  details: {
    contactId: string;
    hasMatchingAddress: boolean;
    hasMatchingPhone: boolean;
    addressSource?: string;
    phoneSource?: string;
    skipReasons: string[];
  }[];
}

export async function checkExistingDataForCampaign(
  campaignId: string,
  eligibleContactsOnly: boolean = true
): Promise<ExistingDataCheckResult> {
  const whereConditions = [
    eq(verificationContacts.campaignId, campaignId),
    eq(verificationContacts.deleted, false)
  ];

  if (eligibleContactsOnly) {
    whereConditions.push(eq(verificationContacts.eligibilityStatus, 'Eligible'));
  }

  const contacts = await db.query.verificationContacts.findMany({
    where: and(...whereConditions)
  });

  if (contacts.length === 0) {
    return {
      total: 0,
      addressComplete: 0,
      phoneComplete: 0,
      needsAddressEnrichment: 0,
      needsPhoneEnrichment: 0,
      needsBothEnrichment: 0,
      fullyComplete: 0,
      details: []
    };
  }

  const results: {
    contactId: string;
    hasMatchingAddress: boolean;
    hasMatchingPhone: boolean;
    addressSource?: string;
    phoneSource?: string;
    skipReasons: string[];
    update: any;
  }[] = [];

  let addressComplete = 0;
  let phoneComplete = 0;
  let needsAddressEnrichment = 0;
  let needsPhoneEnrichment = 0;
  let needsBothEnrichment = 0;
  let fullyComplete = 0;

  for (const contact of contacts) {
    const addressCheck = hasMatchingAddress(contact);
    const phoneCheck = hasMatchingPhone(contact);
    const enrichmentNeeds = getEnrichmentNeeds(contact);

    const hasAddress = addressCheck.geographyMatches;
    const hasPhone = phoneCheck.geographyMatches;

    if (hasAddress) addressComplete++;
    if (hasPhone) phoneComplete++;

    if (enrichmentNeeds.needsAddressEnrichment && enrichmentNeeds.needsPhoneEnrichment) {
      needsBothEnrichment++;
    } else if (enrichmentNeeds.needsAddressEnrichment) {
      needsAddressEnrichment++;
    } else if (enrichmentNeeds.needsPhoneEnrichment) {
      needsPhoneEnrichment++;
    }

    if (hasAddress && hasPhone) {
      fullyComplete++;
    }

    const addressEnrichmentStatus = enrichmentNeeds.needsAddressEnrichment 
      ? 'pending' 
      : 'not_needed';
    
    const phoneEnrichmentStatus = enrichmentNeeds.needsPhoneEnrichment 
      ? 'pending' 
      : 'not_needed';

    results.push({
      contactId: contact.id,
      hasMatchingAddress: hasAddress,
      hasMatchingPhone: hasPhone,
      addressSource: addressCheck.source,
      phoneSource: phoneCheck.source,
      skipReasons: enrichmentNeeds.skipReasons,
      update: {
        addressEnrichmentStatus,
        phoneEnrichmentStatus
      }
    });
  }

  await batchUpdateEnrichmentStatus(results);

  return {
    total: contacts.length,
    addressComplete,
    phoneComplete,
    needsAddressEnrichment: needsAddressEnrichment + needsBothEnrichment,
    needsPhoneEnrichment: needsPhoneEnrichment + needsBothEnrichment,
    needsBothEnrichment,
    fullyComplete,
    details: results.map(r => ({
      contactId: r.contactId,
      hasMatchingAddress: r.hasMatchingAddress,
      hasMatchingPhone: r.hasMatchingPhone,
      addressSource: r.addressSource,
      phoneSource: r.phoneSource,
      skipReasons: r.skipReasons
    }))
  };
}

async function batchUpdateEnrichmentStatus(
  results: { contactId: string; update: any }[]
): Promise<void> {
  const BATCH_SIZE = 100;

  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);
    
    await Promise.all(
      batch.map(async ({ contactId, update }) => {
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

export async function getContactsNeedingAddressEnrichment(
  campaignId: string,
  limit: number = 100
): Promise<VerificationContact[]> {
  return await db.query.verificationContacts.findMany({
    where: and(
      eq(verificationContacts.campaignId, campaignId),
      eq(verificationContacts.deleted, false),
      eq(verificationContacts.eligibilityStatus, 'Eligible'),
      eq(verificationContacts.addressEnrichmentStatus, 'pending')
    ),
    limit
  });
}

export async function getContactsNeedingPhoneEnrichment(
  campaignId: string,
  limit: number = 100
): Promise<VerificationContact[]> {
  return await db.query.verificationContacts.findMany({
    where: and(
      eq(verificationContacts.campaignId, campaignId),
      eq(verificationContacts.deleted, false),
      eq(verificationContacts.eligibilityStatus, 'Eligible'),
      eq(verificationContacts.phoneEnrichmentStatus, 'pending')
    ),
    limit
  });
}

export async function getEnrichmentStats(campaignId: string): Promise<{
  addressPending: number;
  addressCompleted: number;
  addressFailed: number;
  addressNotNeeded: number;
  phonePending: number;
  phoneCompleted: number;
  phoneFailed: number;
  phoneNotNeeded: number;
}> {
  const contacts = await db.query.verificationContacts.findMany({
    where: and(
      eq(verificationContacts.campaignId, campaignId),
      eq(verificationContacts.deleted, false),
      eq(verificationContacts.eligibilityStatus, 'Eligible')
    ),
    columns: {
      addressEnrichmentStatus: true,
      phoneEnrichmentStatus: true
    }
  });

  const stats = {
    addressPending: 0,
    addressCompleted: 0,
    addressFailed: 0,
    addressNotNeeded: 0,
    phonePending: 0,
    phoneCompleted: 0,
    phoneFailed: 0,
    phoneNotNeeded: 0
  };

  for (const contact of contacts) {
    switch (contact.addressEnrichmentStatus) {
      case 'pending':
        stats.addressPending++;
        break;
      case 'completed':
        stats.addressCompleted++;
        break;
      case 'failed':
        stats.addressFailed++;
        break;
      case 'not_needed':
        stats.addressNotNeeded++;
        break;
    }

    switch (contact.phoneEnrichmentStatus) {
      case 'pending':
        stats.phonePending++;
        break;
      case 'completed':
        stats.phoneCompleted++;
        break;
      case 'failed':
        stats.phoneFailed++;
        break;
      case 'not_needed':
        stats.phoneNotNeeded++;
        break;
    }
  }

  return stats;
}
