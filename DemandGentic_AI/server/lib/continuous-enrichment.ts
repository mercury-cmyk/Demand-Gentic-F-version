/**
 * Continuous AI Enrichment System
 * Identifies contacts missing BOTH Best Phone AND Best Address and queues them for AI enrichment
 * 
 * STRATEGY: Only enrich contacts that are missing both phone and address
 * This prevents wasting AI credits on contacts that already have one of the two critical fields
 */

import { db } from '../db';
import { verificationContacts } from '@shared/schema';
import { sql, and, eq, or } from 'drizzle-orm';
import { selectBestVerificationContactData } from './verification-best-data';
import { analyzeContactCompleteness } from './contact-completeness';

export interface EnrichmentStats {
  scanned: number;
  queued: number;
  alreadyComplete: number;
  hasPartialData: number; // Has phone OR address (don't enrich)
  errors: number;
}

/**
 * Identify contacts needing enrichment (Eligible + Validated but missing BOTH phone AND address)
 * ONLY queues contacts that need both fields - this is more cost-effective
 * 
 * @param campaignId - Campaign to scan for enrichment
 * @param ignoreEmailValidation - If true, enriches contacts regardless of email validation status (default: false)
 */
export async function identifyContactsForEnrichment(
  campaignId: string, 
  ignoreEmailValidation: boolean = false
): Promise {
  const validationMode = ignoreEmailValidation ? 'BYPASS EMAIL VALIDATION' : 'email validated only';
  console.log(`[CONTINUOUS ENRICHMENT] Scanning campaign ${campaignId} for contacts missing BOTH phone AND address (${validationMode})`);
  
  const stats: EnrichmentStats = {
    scanned: 0,
    queued: 0,
    alreadyComplete: 0,
    hasPartialData: 0,
    errors: 0,
  };
  
  const needsBothEnrichment: string[] = [];
  
  try {
    // Build email status filter conditionally
    // Inclusive approach: exclude only explicitly invalid emails
    const emailStatusFilter = ignoreEmailValidation 
      ? sql`` 
      : sql`AND (c.email_status IS NULL OR c.email_status != 'invalid')`;
    
    // Fetch all Eligible + Validated contacts
    const contacts = await db.execute(sql`
      SELECT 
        c.id,
        c.phone,
        c.mobile,
        c.contact_address1,
        c.contact_address2,
        c.contact_address3,
        c.contact_city,
        c.contact_state,
        c.contact_country,
        c.contact_postal,
        c.hq_phone,
        c.hq_address_1,
        c.hq_address_2,
        c.hq_address_3,
        c.hq_city,
        c.hq_state,
        c.hq_country,
        c.hq_postal,
        c.ai_enriched_phone,
        c.ai_enriched_address1,
        c.ai_enriched_address2,
        c.ai_enriched_address3,
        c.ai_enriched_city,
        c.ai_enriched_state,
        c.ai_enriched_country,
        c.ai_enriched_postal,
        c.custom_fields,
        c.email_status
      FROM verification_contacts c
      WHERE c.campaign_id = ${campaignId}
        AND c.deleted = FALSE
        AND c.suppressed = FALSE
        AND c.eligibility_status = 'Eligible'
        AND c.verification_status = 'Validated'
        ${emailStatusFilter}
    `);
    
    stats.scanned = contacts.rows.length;
    console.log(`[CONTINUOUS ENRICHMENT] Scanned ${stats.scanned} Eligible+Validated contacts`);
    
    // Analyze each contact for completeness
    for (const contact of contacts.rows as any[]) {
      try {
        const smartData = selectBestVerificationContactData({
          phone: contact.phone,
          mobile: contact.mobile,
          contactAddress1: contact.contact_address1,
          contactAddress2: contact.contact_address2,
          contactAddress3: contact.contact_address3,
          contactCity: contact.contact_city,
          contactState: contact.contact_state,
          contactCountry: contact.contact_country,
          contactPostal: contact.contact_postal,
          hqPhone: contact.hq_phone,
          hqAddress1: contact.hq_address_1,
          hqAddress2: contact.hq_address_2,
          hqAddress3: contact.hq_address_3,
          hqCity: contact.hq_city,
          hqState: contact.hq_state,
          hqCountry: contact.hq_country,
          hqPostal: contact.hq_postal,
          aiEnrichedPhone: contact.ai_enriched_phone,
          aiEnrichedAddress1: contact.ai_enriched_address1,
          aiEnrichedAddress2: contact.ai_enriched_address2,
          aiEnrichedAddress3: contact.ai_enriched_address3,
          aiEnrichedCity: contact.ai_enriched_city,
          aiEnrichedState: contact.ai_enriched_state,
          aiEnrichedCountry: contact.ai_enriched_country,
          aiEnrichedPostal: contact.ai_enriched_postal,
          customFields: contact.custom_fields,
        });
        
        const completeness = analyzeContactCompleteness(smartData);
        
        if (completeness.isClientReady) {
          stats.alreadyComplete++;
        } else {
          const needsPhone = !completeness.hasCompletePhone;
          const needsAddress = !completeness.hasCompleteAddress;
          
          // CRITICAL: Only queue if missing BOTH phone AND address
          if (needsPhone && needsAddress) {
            needsBothEnrichment.push(contact.id);
            stats.queued++;
          } else {
            // Has phone OR address (but not both) - skip enrichment
            stats.hasPartialData++;
          }
        }
      } catch (error) {
        console.error(`[CONTINUOUS ENRICHMENT] Error analyzing contact ${contact.id}:`, error);
        stats.errors++;
      }
    }
    
    console.log(`[CONTINUOUS ENRICHMENT] Summary:
      - Complete: ${stats.alreadyComplete}
      - Has partial data (skipped): ${stats.hasPartialData}
      - Missing BOTH (queued): ${needsBothEnrichment.length}
      - Errors: ${stats.errors}
    `);
    
    return {
      needsBothEnrichment,
      stats,
    };
  } catch (error) {
    console.error('[CONTINUOUS ENRICHMENT] Error:', error);
    throw error;
  }
}

/**
 * Queue contacts for AI enrichment
 * Updates enrichment status flags to mark contacts as pending for BOTH phone and address enrichment
 */
export async function queueForEnrichment(contactIds: string[]): Promise {
  if (contactIds.length === 0) return 0;
  
  console.log(`[CONTINUOUS ENRICHMENT] Queuing ${contactIds.length} contacts for BOTH phone and address enrichment`);
  
  // Mark contacts as pending enrichment for BOTH fields
  const result = await db.execute(sql`
    UPDATE verification_contacts
    SET 
      phone_enrichment_status = 'pending'::phone_enrichment_status,
      address_enrichment_status = 'pending'::address_enrichment_status,
      updated_at = NOW()
    WHERE id = ANY(ARRAY[${sql.join(contactIds.map(id => sql`${id}`), sql`, `)}])
  `);
  
  console.log(`[CONTINUOUS ENRICHMENT] Updated enrichment status for ${result.rowCount} contacts`);
  return result.rowCount || 0;
}