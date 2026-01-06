# Phone Enrichment Display Fix

## Issue
AI-enriched phone numbers were not showing in the contact details page.

## Root Cause
**Field Mismatch**: The enrichment API was saving phone data to the wrong field:
- ❌ **Was saving to**: `phone` or `directPhone` fields
- ✅ **Should save to**: `hqPhone` field (HQ Phone = LOCAL office phone)

The UI was correctly trying to display from `hqPhone`, but enrichment wasn't populating it.

## What Was Fixed

### Backend Changes (server/routes/verification-enrichment.ts)

**Bulk Enrichment Endpoint** (Line 246):
```typescript
// BEFORE:
updateData.phone = result.phone;

// AFTER:
updateData.hqPhone = result.phone; // Save to hqPhone field (LOCAL office phone)
```

**Individual Contact Enrichment Endpoint** (Line 463):
```typescript
// BEFORE:
updateData.directPhone = result.phone; // ❌ directPhone doesn't exist in verificationContacts

// AFTER:
updateData.hqPhone = result.phone; // ✅ Save to hqPhone field (LOCAL office phone)
```

### Database Schema (shared/schema.ts)
**verificationContacts table has these phone fields:**
- `phone`: General contact phone
- `mobile`: Mobile phone number
- `hqPhone`: **HQ/LOCAL office phone (THIS is what enrichment populates)**

**Note:** The `directPhone` field only exists in the `contacts` table, NOT in `verificationContacts`!

## UI Display (Already Correct)

The UI was already correctly configured to display enriched data:

**Company Tab** (verification-console.tsx, Line 1217):
```tsx
<Label>HQ Phone (Enriched)</Label>
<Input value={(contact as any)?.hqPhone || (contact as any)?.main_phone || ""} />
```

**Address Display** (Lines 1231-1243):
Also correctly displays enriched address from `contactAddress1`, `contactAddress2`, etc.

## How to Test the Fix

### 1. Re-enrich Existing Contacts
Since previous enrichments saved phone to the wrong field, you need to re-enrich:

```
1. Go to Data Verification → Select a campaign
2. Select contacts that were previously enriched
3. Click "Enrich Data" button
4. In the dialog, check "Force Re-enrichment" (if available)
   OR just run enrichment again - it will re-process contacts with missing hqPhone
```

### 2. Verify Phone Display
After enrichment completes:
```
1. Click on an enriched contact
2. Go to "Company" tab
3. Look for "HQ Phone (Enriched)" field
4. You should now see the AI-enriched phone number (e.g., "+65 6888 8888")
```

### 3. Check Enrichment Status
In the contact table, verify:
- `phoneEnrichmentStatus` = 'completed'
- `phoneEnrichedAt` timestamp is populated
- `hqPhone` field contains the phone number

## What Enrichment Populates

### ✅ Phone Fields (FIXED)
- **`hqPhone`**: LOCAL office phone number based on contact's country
  - Example: Microsoft Singapore → "+65 6888 8888"
  - This is displayed as "HQ Phone (Enriched)" in the UI

### ✅ Address Fields (Already Working)
- **`contactAddress1`**: Street address
- **`contactAddress2`**: Building/Suite (if applicable)
- **`contactAddress3`**: Additional address info
- **`contactCity`**: City
- **`contactState`**: State/Region
- **`contactPostal`**: Postal code
- **`contactCountry`**: Country

## Expected Behavior

When enrichment finds company data:
```json
{
  "address": {
    "address1": "One Marina Boulevard, #22-01",
    "city": "Singapore",
    "state": "",
    "postalCode": "018989",
    "country": "Singapore"
  },
  "phone": "+65 6888 8888",
  "confidence": 1.0
}
```

This data is saved to:
- Address → `contactAddress1`, `contactCity`, `contactPostal`, etc.
- Phone → `hqPhone` ✅ **FIXED**

## Confidence Threshold

Both address and phone require **≥70% confidence** to be saved:
- If confidence < 0.7, the enrichment is rejected
- Status is marked as 'failed' with reason: "Low confidence"

## Backward Compatibility

**Old enrichments** (saved to wrong fields):
- Will NOT automatically migrate
- Need to be re-enriched to populate `hqPhone`

**New enrichments** (after this fix):
- Will correctly save to `hqPhone`
- Will display immediately in UI

---

**Status**: ✅ Fixed  
**Date**: October 21, 2025  
**Files Modified**: `server/routes/verification-enrichment.ts`
