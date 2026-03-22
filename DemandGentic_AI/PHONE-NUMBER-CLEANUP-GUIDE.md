# Phone Number Cleanup Guide

## Problem

Your campaign is failing to initiate calls because some contacts have **invalid phone numbers** that don't meet E.164 format requirements. Telnyx rejects these with error code `10016`.

### Examples of Invalid Numbers

- `+44123400000000000` - Too long (17 digits instead of max 15)
- `+1111111111111` - Repeated digits (test data)
- `+4400000000000` - All zeros (dummy data)
- `+1234` - Too short (less than 10 digits)

### Impact

When the orchestrator tries to call these numbers:
1. ✅ Queue item is locked (`status = 'in_progress'`)
2. ❌ Telnyx API rejects the call (invalid phone format)
3. ✅ Queue item is reset to `queued` for retry
4. ⏰ But WebSocket connection is already established
5. ❌ OpenAI validates and fails (queue item now `queued` instead of `in_progress`)
6. 🔄 Creates a race condition with failed call attempts

## Solution

Use the cleanup script to automatically identify and remove contacts with invalid phone numbers from your campaign queue.

## Running the Cleanup Script

```bash
cd c:\Users\Zahid\Downloads\DemandEarn-AI
npx tsx cleanup-invalid-phones.ts
```

## What the Script Does

### Step 1: Identifies Invalid Numbers

Finds contacts with phone numbers that are:
- **Too long**: More than 16 characters (max E164 is +[15 digits])
- **Too short**: Less than 11 characters (min E164 is +[10 digits])
- **Repeated digits**: 8+ consecutive same digits (e.g., `00000000`, `11111111`)
- **Test data patterns**: Obvious dummy/test numbers

### Step 2: Removes from Queue

Marks all queue items with these contacts as:
```sql
status = 'removed'
removed_reason = 'invalid_phone_number'
```

This prevents them from being dialed again.

### Step 3: Auto-Fixes Where Possible

If a contact has:
- ❌ Invalid direct phone
- ✅ Valid mobile phone

The script will **copy the mobile phone to direct phone** automatically.

### Step 4: Reports Summary

Shows you:
- Total invalid contacts found
- Queue items removed
- Contacts auto-fixed
- Breakdown by campaign

## Example Output

```
================================================================================
CLEANING UP INVALID PHONE NUMBERS FROM CAMPAIGN QUEUE
================================================================================

🔍 Step 1: Finding contacts with invalid phone numbers...

❌ Found 15 contacts with invalid phone numbers:

📱 TOO LONG (3 contacts):
   - Andrea Gomez at The Purple Juice Co.
     Direct: +44123400000000000
     Mobile: N/A
     In 1 campaign queue(s)
   - Jordan Kinsella at The Purple Juice Co.
     Direct: +44123400000000000
     Mobile: N/A
     In 1 campaign queue(s)
   ... and 1 more

📱 REPEATED DIGITS / TEST DATA (5 contacts):
   - Test Contact at Test Company
     Direct: +11111111111
     Mobile: N/A
     In 2 campaign queue(s)
   ... and 4 more

🗑️  Step 2: Removing invalid contacts from campaign queue...

✅ Removed 18 queue items with invalid phone numbers

📊 Breakdown by campaign:
   - ff475cfd-2af3-4821-8d91-c62535cde2b1: 15 items removed
   - bd8ab195-8eed-4d30-b792-6973cf5babda: 3 items removed

🔧 Step 3: Checking if any phone numbers can be auto-corrected...

💡 Found 2 contacts where we can copy mobile phone to direct phone:
   ✅ Fixed: John Smith - copied mobile (+14155551234) to direct phone
   ✅ Fixed: Jane Doe - copied mobile (+14155555678) to direct phone

================================================================================
CLEANUP SUMMARY
================================================================================

📊 Total invalid contacts found: 15
🗑️  Queue items removed: 18
🔧 Contacts auto-fixed: 2

✅ Cleanup complete!

NEXT STEPS:
1. Review the contacts listed above
2. Either delete them or manually fix their phone numbers
3. If you fixed phone numbers, re-add them to campaigns
4. Run your campaign again - invalid numbers are now skipped
```

## After Running the Script

### Option 1: Delete Invalid Contacts (Recommended)

If these are test/dummy contacts, delete them:

```sql
DELETE FROM contacts
WHERE
  (LENGTH(direct_phone_e164) > 16 OR LENGTH(mobile_phone_e164) > 16)
  OR (direct_phone_e164 LIKE '%00000000%' OR mobile_phone_e164 LIKE '%00000000%')
  OR (direct_phone_e164 ~ '(1{8,}|2{8,}|3{8,}|4{8,})' OR mobile_phone_e164 ~ '(1{8,}|2{8,}|3{8,}|4{8,})')
  OR (LENGTH(direct_phone_e164)  16
   OR direct_phone_e164 LIKE '%00000000%'
   OR LENGTH(direct_phone_e164)  16
   OR mobile_phone_e164 LIKE '%00000000%'
   OR LENGTH(mobile_phone_e164)  16) return false;

  // Must be only digits after +
  if (!/^\+\d{10,15}$/.test(phone)) return false;

  // No repeated digits (8+)
  if (/(\d)\1{7,}/.test(phone)) return false;

  return true;
}
```

### Campaign Queue Filtering

The orchestrator already filters out contacts without phone numbers, but now invalid formats will also be caught earlier.

## E.164 Format Reference

Valid E.164 format:
- **Format**: `+[country code][number]`
- **Length**: 11-16 characters total (including +)
- **Characters**: Only digits after the +

**Examples:**
- ✅ `+14155551234` (US - 11 chars)
- ✅ `+447700900123` (UK - 13 chars)
- ✅ `+8613812345678` (China - 14 chars)
- ❌ `+44123400000000000` (Too long - 18 chars)
- ❌ `+1234` (Too short - 5 chars)
- ❌ `14155551234` (Missing +)
- ❌ `+1-415-555-1234` (Has hyphens)

## Country-Specific Formats

### United States / Canada (+1)
- Format: `+1XXXXXXXXXX`
- Length: 12 characters
- Example: `+14155551234`

### United Kingdom (+44)
- Format: `+44XXXXXXXXXX`
- Length: 13 characters
- Example: `+447700900123`

### Common Mistake

If you see numbers like `+44123400000000000`, this is likely:
- Someone manually typing in test data
- Import script padding with zeros
- Default/placeholder value from source system

**These MUST be removed or fixed before running campaigns.**

## Related Files

- `cleanup-invalid-phones.ts` - Main cleanup script
- `server/lib/ai-campaign-orchestrator.ts` - Where calls are initiated
- `server/services/telnyx-ai-bridge.ts` - Where Telnyx validation happens

## Support

If you encounter issues with the cleanup script or need help fixing phone numbers, check:

1. **Script output** for specific contacts with issues
2. **Source system** where contacts were imported from
3. **Data import logs** to see if validation was skipped
4. **Contact creation flow** to ensure E.164 validation

The script is safe to run multiple times - it will only show remaining invalid numbers on subsequent runs.