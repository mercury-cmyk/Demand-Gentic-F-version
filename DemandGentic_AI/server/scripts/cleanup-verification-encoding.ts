#!/usr/bin/env tsx
/**
 * Cleanup Script: Fix Character Encoding in Verification Contacts
 * 
 * Fixes UTF-8 corruption (mojibake) in verification campaign contacts
 * Usage: npx tsx server/scripts/cleanup-verification-encoding.ts 
 */

import { db } from '../db';
import { verificationContacts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { sanitizeText, hasCorruptCharacters } from '../lib/text-sanitization';

const campaignId = process.argv[2];

if (!campaignId) {
  console.error('❌ Error: Campaign ID required');
  console.error('Usage: npx tsx server/scripts/cleanup-verification-encoding.ts ');
  process.exit(1);
}

async function cleanupEncoding() {
  console.log(`\n🔧 Fixing character encoding for campaign: ${campaignId}\n`);

  try {
    // Fetch all contacts for the campaign
    console.log('📥 Fetching contacts...');
    const contacts = await db
      .select()
      .from(verificationContacts)
      .where(eq(verificationContacts.campaignId, campaignId));

    console.log(`Found ${contacts.length} contacts\n`);

    if (contacts.length === 0) {
      console.log('✅ No contacts found for this campaign');
      return;
    }

    let totalCorruptFields = 0;
    let updatedContacts = 0;
    const corruptionSamples: string[] = [];

    // Text fields to check and sanitize
    const textFields: Array = [
      'fullName',
      'firstName',
      'lastName',
      'title',
      'contactCity',
      'contactState',
      'contactCountry',
    ];

    // Process contacts in batches
    console.log('🔍 Scanning for corrupt characters...\n');
    
    for (const contact of contacts) {
      const updates: any = {};
      let hasCorruption = false;

      for (const field of textFields) {
        const value = contact[field as keyof typeof contact];
        
        if (value && typeof value === 'string') {
          if (hasCorruptCharacters(value)) {
            const sanitized = sanitizeText(value);
            
            if (sanitized && sanitized !== value) {
              updates[field] = sanitized;
              hasCorruption = true;
              totalCorruptFields++;
              
              // Collect samples (max 20)
              if (corruptionSamples.length  0) {
      console.log('\n📝 Sample fixes (first 20):');
      corruptionSamples.forEach((sample, index) => {
        console.log(`   ${index + 1}. ${sample}`);
      });
    }

    console.log('\n✅ Character encoding cleanup complete!\n');

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

cleanupEncoding();