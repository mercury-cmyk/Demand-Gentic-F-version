# External Email Validation Workflow

## Overview
This document outlines the complete workflow for validating emails externally (without using the EMAIL_LIST_VERIFY_KEY API integration) and tracking lead submissions to clients.

## Why Use External Validation?
- **Cost Control**: Validate emails using your own preferred service or bulk validation tools
- **Flexibility**: Use any email validation service (ZeroBounce, NeverBounce, etc.)
- **Batch Processing**: Handle large volumes more efficiently with bulk upload services
- **Quality Assurance**: Manual review of validation results before delivery

## Complete Workflow

### Step 1: Export Eligible Contacts for Validation

**Endpoint**: `GET /api/verification-campaigns/:campaignId/contacts/export/validated-verified`

**Purpose**: Export contacts that are ready for email validation

**What this exports**:
- Contacts with `verificationStatus = 'Validated'`
- Contacts with `eligibilityStatus = 'Eligible'`
- Contacts that are NOT suppressed
- Contacts that are NOT deleted
- **Respects per-account caps**: Only exports the number of contacts per company that match your campaign's `leadCapPerAccount` setting

**How to use**:
1. Navigate to your Verification Campaign
2. Click "Export Validated Contacts" or use the API directly
3. Download the CSV file

**Query parameters**:
- `includeCompany=true` (default) - Includes company/account fields in export

**Example**:
```bash
GET /api/verification-campaigns/abc-123/contacts/export/validated-verified?includeCompany=true
```

### Step 2: Validate Emails Externally

**Process**:
1. Take the exported CSV file
2. Upload to your preferred email validation service:
   - EmailListVerify.com
   - ZeroBounce
   - NeverBounce
   - Hunter.io
   - Any other service

3. Wait for validation results
4. Download the validated results CSV

**Important**: The validation service should provide a status for each email (valid/invalid/risky/catch-all/etc.)

### Step 3: Upload Validation Results

**Endpoint**: `POST /api/verification-campaigns/:campaignId/contacts/csv-upload`

**Purpose**: Import the validation results back into the system

**CSV Format Requirements**:
Your CSV must include these columns:
- `email` (required) - Used to match existing contacts
- `emailStatus` (required) - Values: `ok`, `invalid`, `risky`, `unknown`

**How the system processes the upload**:
1. Matches rows by email address
2. Updates the `emailStatus` field for matching contacts
3. Uses smart deduplication to handle duplicates
4. Processes in batches of 2,500 contacts (handles large files efficiently)

**Example CSV**:
```csv
email,emailStatus
john.doe@example.com,ok
jane.smith@invalid.com,invalid
bob@catchall.com,risky
```

**How to upload**:
1. Go to your Verification Campaign
2. Click "Import CSV" or "Upload Validation Results"
3. Select your file
4. Map the columns (email → Email, emailStatus → Email Status)
5. Click "Import"

### Step 4: Prepare Submission Buffer

**Endpoint**: `POST /api/verification-campaigns/:campaignId/submission/prepare`

**Purpose**: Lock contacts that are ready for delivery to the client

**What this does**:
1. Selects contacts where:
   - `verificationStatus = 'Validated'`
   - `eligibilityStatus = 'Eligible'`
   - `emailStatus = 'ok'` (from your external validation)
   - `suppressed = false`
   - `inSubmissionBuffer = false` (not already locked)
   - Account has NOT exceeded the `leadCapPerAccount` limit

2. Creates a submission record in `verification_lead_submissions` table
3. Sets `inSubmissionBuffer = true` to lock the contact
4. Respects per-account caps automatically

**Request Body**:
```json
{
  "batchSize": 500
}
```

**Response**:
```json
{
  "buffered": 237
}
```

**How to use**:
1. Go to your Verification Campaign
2. Click "Prepare Submission Buffer"
3. Review the count of contacts ready for delivery

### Step 5: Export Buffered Leads for Client Delivery

**Endpoint**: `GET /api/verification-campaigns/:campaignId/submission/export`

**Purpose**: Export the final validated leads for delivery to your client

**What this exports**:
- Only contacts where `inSubmissionBuffer = true`
- Contacts with `emailStatus = 'ok'`
- Enriched with company/account data
- Formatted for client delivery

**Templates Available**:
- `enriched` (default) - Full contact and company data
- `client_cav` - CAV-specific format with custom fields

**Query parameters**:
- `template=enriched` (default) or `template=client_cav`

**Example**:
```bash
GET /api/verification-campaigns/abc-123/submission/export?template=enriched
```

**How to use**:
1. Go to your Verification Campaign
2. Click "Export for Delivery" or "Export Submission Buffer"
3. Select your template format
4. Download the CSV
5. Deliver to your client via email, FTP, API, etc.

### Step 6: Track Delivery (Optional)

**Purpose**: Mark when leads were actually delivered to the client

**Endpoint**: `POST /api/verification-campaigns/:campaignId/submission/mark-delivered`

**Request Body**:
```json
{
  "contactIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**What this does**:
- Updates `deliveredAt` timestamp in `verification_lead_submissions` table
- Creates audit trail of when leads were sent to client

### Step 7: Clear Submission Buffer

**Endpoint**: `POST /api/verification-campaigns/:campaignId/flush`

**Purpose**: Reset the buffer for the next batch

**What this does**:
- Sets `inSubmissionBuffer = false` for all contacts in the campaign
- Does NOT delete submission records (tracking remains intact)
- Allows you to prepare a new batch

**How to use**:
1. After successfully delivering leads to client
2. Click "Clear Buffer" or "Reset Submission Queue"
3. Confirm the action

## Per-Account Cap Enforcement

The system **automatically enforces** per-account caps at multiple stages:

### 1. During Export (Step 1)
The `/export/validated-verified` endpoint uses a window function to limit contacts per account:
```sql
ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY priority_score DESC)
```
Only exports up to `leadCapPerAccount` contacts per company.

### 2. During Buffer Preparation (Step 4)
The `/submission/prepare` endpoint checks:
```sql
SELECT COUNT(*) FROM verification_lead_submissions 
WHERE account_id = X AND campaign_id = Y
```
Only buffers contacts if account is below the cap.

### 3. Submission Tracking
The `verification_lead_submissions` table permanently tracks:
- Which contacts were submitted
- When they were submitted (`created_at`)
- When they were delivered (`delivered_at`)
- Per-account totals

## Database Tables

### verification_lead_submissions
Tracks all lead submissions to ensure caps are respected:

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| contact_id | varchar | Reference to verification_contacts |
| account_id | varchar | Reference to accounts |
| campaign_id | varchar | Reference to verification_campaigns |
| created_at | timestamp | When added to buffer |
| delivered_at | timestamp | When delivered to client (nullable) |

### verification_contacts
Key fields for workflow:

| Field | Values | Description |
|-------|--------|-------------|
| verificationStatus | Pending, Validated, Rejected | Manual QA status |
| eligibilityStatus | Eligible, Not Eligible | Rule-based eligibility |
| emailStatus | unknown, ok, invalid, risky | Email validation result |
| suppressed | boolean | Suppression flag |
| inSubmissionBuffer | boolean | Locked for delivery |
| deleted | boolean | Soft delete flag |

## Best Practices

### 1. Always Export Before Validating
Don't validate random contacts. Use the export endpoint to get the exact contacts that meet your criteria.

### 2. Use Batch Processing
The system handles large files efficiently with batch sizes of 2,500 contacts. Don't worry about file size.

### 3. Track Delivery Dates
Use the `mark-delivered` endpoint to maintain accurate records of when leads were sent to clients.

### 4. Clear Buffer After Delivery
Always clear the buffer after successful delivery to avoid confusion and enable the next batch.

### 5. Monitor Caps Per Account
Use the stats endpoints to monitor how many leads have been submitted per account:
```bash
GET /api/verification-campaigns/:campaignId/submission/company-stats
GET /api/verification-campaigns/:campaignId/account-caps
```

## Troubleshooting

### "No contacts exported"
- Check that contacts have `verificationStatus = 'Validated'`
- Verify contacts have `eligibilityStatus = 'Eligible'`
- Ensure accounts haven't exceeded `leadCapPerAccount`
- Check that contacts aren't suppressed or deleted

### "Buffer count is 0"
- Ensure you've uploaded validation results with `emailStatus = 'ok'`
- Check that accounts haven't already hit their caps
- Verify contacts aren't already in the buffer (`inSubmissionBuffer = true`)

### "Contacts not matching during upload"
- Ensure your CSV has an `email` column
- Verify email addresses match exactly (case-insensitive matching is used)
- Check that contacts exist in the campaign

## API Reference Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/contacts/export/validated-verified` | GET | Export eligible contacts for validation |
| `/contacts/csv-upload` | POST | Upload validation results |
| `/submission/prepare` | POST | Lock contacts for delivery |
| `/submission/export` | GET | Export final leads for client |
| `/submission/mark-delivered` | POST | Track delivery timestamp |
| `/flush` | POST | Clear submission buffer |
| `/submission/company-stats` | GET | View per-company submission counts |
| `/account-caps` | GET | View account cap status |

## Example End-to-End Workflow

```bash
# 1. Export eligible contacts
curl -X GET "https://yourapp.replit.app/api/verification-campaigns/abc-123/contacts/export/validated-verified" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o eligible-contacts.csv

# 2. Upload to external validation service (manual step)
# ... upload eligible-contacts.csv to EmailListVerify, ZeroBounce, etc.

# 3. Download validated results (manual step)
# ... download validated-results.csv from service

# 4. Upload validation results back to system
curl -X POST "https://yourapp.replit.app/api/verification-campaigns/abc-123/contacts/csv-upload" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@validated-results.csv"

# 5. Prepare submission buffer
curl -X POST "https://yourapp.replit.app/api/verification-campaigns/abc-123/submission/prepare" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 500}'

# 6. Export for client delivery
curl -X GET "https://yourapp.replit.app/api/verification-campaigns/abc-123/submission/export?template=enriched" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o final-delivery.csv

# 7. Deliver to client (manual step)
# ... send final-delivery.csv to client

# 8. Clear buffer for next batch
curl -X POST "https://yourapp.replit.app/api/verification-campaigns/abc-123/flush" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
