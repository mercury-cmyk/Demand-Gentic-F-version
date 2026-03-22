/**
 * Test searching for recordings by phone number instead of call_control_id
 */

import { db } from "./server/db";
import { dialerCallAttempts, contacts } from "./shared/schema";
import { eq, and, desc, gt } from "drizzle-orm";
import { searchRecordingsByDialedNumber } from "./server/services/telnyx-recordings";

async function testPhoneLookup() {
  console.log("=== TESTING PHONE NUMBER RECORDING LOOKUP ===\n");

  // Get a few misclassified calls with their phone numbers
  const calls = await db
    .select({
      call: dialerCallAttempts,
      contact: contacts,
    })
    .from(dialerCallAttempts)
    .innerJoin(contacts, eq(dialerCallAttempts.contactId, contacts.id))
    .where(
      and(
        eq(dialerCallAttempts.disposition, "no_answer"),
        gt(dialerCallAttempts.callDurationSeconds, 60)
      )
    )
    .orderBy(desc(dialerCallAttempts.createdAt))
    .limit(5);

  console.log(`Found ${calls.length} calls to test\n`);

  for (const { call, contact } of calls) {
    const phone = contact.directPhone || contact.mobilePhone || call.phoneDialed;

    if (!phone) {
      console.log(`Call ${call.id.substring(0, 8)}: No phone number found`);
      continue;
    }

    // Format phone for Telnyx (needs E.164 format)
    let formattedPhone = phone.replace(/[^0-9+]/g, '');
    if (!formattedPhone.startsWith('+')) {
      // Assume US number if no country code
      if (formattedPhone.length === 10) {
        formattedPhone = '+1' + formattedPhone;
      } else if (formattedPhone.length === 11 && formattedPhone.startsWith('1')) {
        formattedPhone = '+' + formattedPhone;
      }
    }

    console.log(`\nCall ${call.id.substring(0, 8)}:`);
    console.log(`  Contact: ${contact.firstName} ${contact.lastName}`);
    console.log(`  Phone (raw): ${phone}`);
    console.log(`  Phone (E.164): ${formattedPhone}`);
    console.log(`  Call Time: ${call.createdAt}`);
    console.log(`  Duration: ${call.callDurationSeconds}s`);

    // Search for recordings in a 1-hour window around the call time
    const searchStart = new Date(call.createdAt);
    searchStart.setMinutes(searchStart.getMinutes() - 30);
    const searchEnd = new Date(call.createdAt);
    searchEnd.setMinutes(searchEnd.getMinutes() + 30);

    console.log(`  Searching recordings from ${searchStart.toISOString()} to ${searchEnd.toISOString()}...`);

    try {
      const recordings = await searchRecordingsByDialedNumber(formattedPhone, searchStart, searchEnd);

      if (recordings.length > 0) {
        console.log(`  ✅ FOUND ${recordings.length} recording(s)!`);
        for (const rec of recordings) {
          console.log(`    - Recording ID: ${rec.id}`);
          console.log(`      Status: ${rec.status}`);
          console.log(`      Duration: ${Math.floor(rec.duration_millis / 1000)}s`);
          console.log(`      MP3 URL: ${rec.download_urls?.mp3 || 'None'}`);
          console.log(`      WAV URL: ${rec.download_urls?.wav || 'None'}`);
          console.log(`      Full recording object:`, JSON.stringify(rec, null, 2));
        }
      } else {
        console.log(`  ❌ No recordings found`);
      }
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
}

testPhoneLookup()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });