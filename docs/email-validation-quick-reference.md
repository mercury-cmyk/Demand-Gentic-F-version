# Email Validation Quick Reference

## Two Validation Methods Available

### Method 1: Automated API Validation (Recommended if API key is configured)

**Prerequisites**: EMAIL_LIST_VERIFY_KEY configured in Replit Secrets

**Process**:
1. Navigate to Verification Campaign
2. Click "Bulk Validate Emails" button
3. System automatically:
   - Validates emails via EmailListVerify API
   - Uses smart caching (90-day cache) to minimize costs
   - Processes in background with progress tracking
   - Updates `emailStatus` field (ok/invalid/risky)
   - Respects per-account caps during validation

**Advantages**:
- ✅ Fully automated
- ✅ Smart caching reduces costs
- ✅ Real-time progress tracking
- ✅ Background processing handles large volumes
- ✅ Automatic retry on failures

**When to use**: When you have API access and want fast, automated validation

---

### Method 2: External Validation Workflow (Manual control)

**Prerequisites**: None - works with any email validation service

**Process**:

#### Step 1: Export Eligible Contacts
- Click **"Export Eligible Contacts"** in Submission Manager
- Downloads CSV of contacts ready for validation
- Automatically enforces per-account caps
- Only exports: Validated + Eligible + Not Suppressed contacts

#### Step 2: External Validation
- Upload CSV to your validation service:
  - EmailListVerify.com
  - ZeroBounce
  - NeverBounce
  - Hunter.io
  - Any other service
- Wait for validation results
- Download validated results CSV

#### Step 3: Upload Validation Results
- Click **"Import CSV"** in Verification Console
- Upload the validation results file
- Map columns: `email` → Email, `emailStatus` → Email Status
- System updates contacts with validation results

#### Step 4: Lock Validated Contacts
- Click **"Lock Validated Contacts"** in Submission Manager
- System selects contacts where:
  - `emailStatus = 'ok'`
  - Account hasn't exceeded cap
  - Not already in buffer
- Creates submission records
- Sets `inSubmissionBuffer = true`

#### Step 5: Export for Client Delivery
- Click **"Export Buffered Leads"** in Submission Manager
- Downloads final CSV formatted for client
- Template options: `enriched` or `client_cav`

#### Step 6: Clear Buffer
- After delivering to client, click **"Clear Buffer"**
- Resets `inSubmissionBuffer` flag
- Submission records remain for tracking
- Ready for next batch

**Advantages**:
- ✅ Use any validation service
- ✅ Full control over process
- ✅ Batch upload from external tools
- ✅ Manual review before delivery
- ✅ No API costs if using free/bulk services

**When to use**: When you want manual control, use specific validation services, or process very large volumes offline

---

## Per-Account Cap Enforcement

Both methods automatically enforce `leadCapPerAccount` setting:

### Method 1 (Automated API):
- Caps enforced during validation queue selection
- Uses window functions to limit contacts per account
- Only validates up to cap limit

### Method 2 (External):
- Caps enforced during export (Step 1)
- Caps enforced during buffer preparation (Step 4)
- Uses `verification_lead_submissions` table for tracking

## Database Tables

### verification_contacts
| Field | Values | Purpose |
|-------|--------|---------|
| emailStatus | unknown, ok, invalid, risky | Email validation result |
| verificationStatus | Pending, Validated, Rejected | Manual QA status |
| eligibilityStatus | Eligible, Not Eligible | Rule-based eligibility |
| inSubmissionBuffer | boolean | Locked for delivery (Method 2 only) |

### verification_email_validations
| Field | Purpose |
|-------|---------|
| contactId | Reference to contact |
| status | Validation result (ok/invalid/risky) |
| checkedAt | Validation timestamp |
| rawJson | Full API response |

Used for 90-day smart caching in Method 1

### verification_lead_submissions
| Field | Purpose |
|-------|---------|
| contactId | Reference to contact |
| accountId | Reference to account |
| campaignId | Reference to campaign |
| createdAt | When added to buffer |
| deliveredAt | When delivered to client |

Used for cap tracking and delivery audit trail in Method 2

## API Endpoints Reference

### Method 1 (Automated)
```bash
# Start bulk validation job
POST /api/verification-campaigns/:campaignId/contacts/bulk-verify-emails
Body: { contactIds: [...] }

# Check job status
GET /api/verification-campaigns/:campaignId/email-validation-jobs/:jobId

# List all jobs
GET /api/verification-campaigns/:campaignId/email-validation-jobs

# Restart stuck job
POST /api/verification-campaigns/:campaignId/email-validation-jobs/:jobId/restart
```

### Method 2 (External)
```bash
# Step 1: Export
GET /api/verification-campaigns/:campaignId/contacts/export/validated-verified

# Step 3: Upload (use CSV import in UI)
POST /api/verification-campaigns/:campaignId/contacts/csv-upload

# Step 4: Lock buffer
POST /api/verification-campaigns/:campaignId/submission/prepare
Body: { batchSize: 500 }

# Step 5: Export for client
GET /api/verification-campaigns/:campaignId/submission/export?template=enriched

# Step 6: Clear buffer
POST /api/verification-campaigns/:campaignId/flush
```

## Troubleshooting

### Method 1: API Validation Not Working
- ✓ Check EMAIL_LIST_VERIFY_KEY is configured
- ✓ Verify contacts have `verificationStatus = 'Validated'`
- ✓ Ensure contacts have email addresses
- ✓ Check job status for errors
- ✓ Try restarting stuck jobs

### Method 2: Export Shows 0 Contacts
- ✓ Verify contacts have `verificationStatus = 'Validated'`
- ✓ Check `eligibilityStatus = 'Eligible'`
- ✓ Ensure accounts haven't exceeded `leadCapPerAccount`
- ✓ Confirm contacts aren't suppressed or deleted

### Method 2: Buffer Preparation Returns 0
- ✓ Ensure validation results uploaded (emailStatus = 'ok')
- ✓ Check accounts haven't hit their caps
- ✓ Verify contacts aren't already buffered
- ✓ Confirm submission records don't already exist

## Best Practices

1. **Use Method 1 for speed** - If you have API access, automated validation is faster
2. **Use Method 2 for control** - If you need manual review or specific services
3. **Monitor API costs** - Smart caching reduces costs in Method 1
4. **Track delivery dates** - Use submission records to audit deliveries
5. **Clear buffer regularly** - Don't forget Step 6 in Method 2
6. **Respect caps** - Both methods enforce caps automatically
7. **Batch processing** - CSV uploads handle 2,500 contacts per batch efficiently

## UI Locations

### Verification Console
- **Bulk Validate Emails** - Top right (Method 1)
- **CSV Import** - Top right (For Method 2 Step 3)
- **Export Validated+Verified** - Queue header (For Method 2 Step 1)

### Submission Manager (New Section)
- **Export Eligible Contacts** - Step 1
- **Lock Validated Contacts** - Step 2
- **Export Buffered Leads** - Step 3
- **Clear Buffer** - Step 4

Complete workflow instructions and visual guide displayed in Submission Manager card.
