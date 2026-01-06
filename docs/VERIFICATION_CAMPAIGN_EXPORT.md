# Verification Campaign Export Guide

This guide explains how to export verification campaign results to CSV format.

## 📊 Overview

The export system allows you to download verification campaign contacts as CSV files with flexible filtering options. All exports are securely uploaded to S3 and accessed via presigned download URLs (15-minute expiry).

## 🚀 Export Endpoints

### 1. Custom Export with Filters

**Endpoint:** `POST /api/verification-campaigns/:campaignId/export`

Export contacts with custom filtering criteria.

**Request Body:**
```json
{
  "eligibilityStatuses": ["Eligible", "Pending_Email_Validation"],  // Optional
  "verificationStatuses": ["Validated"],                            // Optional
  "emailStatuses": ["ok", "risky"],                                 // Optional
  "suppressed": false,                                              // Optional
  "inSubmissionBuffer": false,                                       // Optional
  "includeDeleted": false                                           // Default: false
}
```

**Response:**
```json
{
  "downloadUrl": "https://s3.amazonaws.com/...",
  "expiresIn": "900s",
  "totalRecords": 1234,
  "fileName": "campaign-name-2025-10-26.csv",
  "filters": {
    "eligibilityStatuses": ["Eligible"],
    "verificationStatuses": ["Validated"],
    "emailStatuses": ["ok"],
    "suppressed": false,
    "inSubmissionBuffer": false
  }
}
```

### 2. Quick Export Presets

Pre-configured export endpoints for common use cases.

#### Ready for Delivery
**Endpoint:** `POST /api/verification-campaigns/:campaignId/export/ready-for-delivery`

Exports contacts that are:
- ✅ Eligible
- ✅ Validated
- ✅ Email status = "ok"
- ✅ Not suppressed
- ✅ Not in submission buffer

**Use case:** Contacts ready to be delivered to the client.

#### Submission Buffer
**Endpoint:** `POST /api/verification-campaigns/:campaignId/export/submission-buffer`

Exports contacts that are:
- ✅ In submission buffer
- ✅ Not suppressed

**Use case:** Contacts locked for delivery (external validation workflow).

#### All Eligible
**Endpoint:** `POST /api/verification-campaigns/:campaignId/export/eligible`

Exports contacts that are:
- ✅ Eligible (regardless of validation status)
- ✅ Not suppressed

**Use case:** All contacts passing geo/title criteria for further processing.

## 📋 CSV Export Format

### Columns Included

The CSV export includes the following columns:

**Contact Information:**
- ID
- Full Name
- First Name
- Last Name
- Title
- Email
- Phone
- Mobile
- LinkedIn URL

**Company Information:**
- Company Name
- Company Website
- Company Industry
- Company Size
- Company Revenue

**Address Fields:**
- Contact City, State, Country, Postal
- HQ City, State, Country, Postal, Phone

**Status & Metadata:**
- Eligibility Status
- Verification Status
- Email Status
- Priority Score
- Suppressed (Yes/No)
- In Submission Buffer (Yes/No)
- Source Type
- CAV ID
- Created At
- Updated At

## 💡 Usage Examples

### Example 1: Export All Ready Contacts

```bash
curl -X POST \
  "http://localhost:5000/api/verification-campaigns/abc123/export/ready-for-delivery" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "downloadUrl": "https://s3.amazonaws.com/bucket/verification-exports/abc123/campaign-name-2025-10-26.csv?...",
  "expiresIn": "900s",
  "totalRecords": 523,
  "fileName": "campaign-name-2025-10-26.csv"
}
```

### Example 2: Custom Filter Export

```bash
curl -X POST \
  "http://localhost:5000/api/verification-campaigns/abc123/export" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eligibilityStatuses": ["Eligible", "Pending_Email_Validation"],
    "verificationStatuses": ["Validated", "To_Review"],
    "emailStatuses": ["ok", "risky"],
    "suppressed": false
  }'
```

### Example 3: Export Submission Buffer

```bash
curl -X POST \
  "http://localhost:5000/api/verification-campaigns/abc123/export/submission-buffer" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

## 🔍 Filter Options

### Eligibility Statuses
- `Eligible` - Passed geo/title criteria
- `Ineligible_Geography` - Failed geography check
- `Ineligible_Title` - Failed title check
- `Ineligible_Email_Invalid` - Email validation failed (syntax/DNS)
- `Ineligible_Email_Risky` - Email is risky (role account, free provider)
- `Ineligible_Email_Disposable` - Disposable/temp email detected
- `Pending_Email_Validation` - Awaiting email validation
- `Excluded` - Manually excluded

### Verification Statuses
- `New` - Newly added contact
- `Validated` - Verified as valid
- `Invalid` - Verified as invalid
- `To_Review` - Needs manual review

### Email Statuses
- `ok` - Email is valid and deliverable
- `invalid` - Email failed validation
- `risky` - Valid but has risk factors
- `accept_all` - Catch-all server (may or may not deliver)
- `disposable` - Disposable email service
- `unknown` - Validation incomplete

## 🔒 Security & Access

- **Authentication Required:** All export endpoints require a valid JWT token
- **Admin-Only Access:** Exports are restricted to administrators only for security and data protection
- **RBAC Enforcement:** Non-admin users receive 403 Forbidden when attempting exports
- **S3 Security:** Files are uploaded to private S3 buckets
- **Presigned URLs:** Download links expire after 15 minutes (900 seconds)
- **File Location:** `s3://bucket/verification-exports/{campaignId}/{filename}.csv`

### Access Control

Export functionality is **admin-only** to prevent unauthorized data access across campaigns and tenants. Regular users must request exports from administrators.

## ⚡ Performance Notes

### Large Exports

For campaigns with >10,000 contacts:
- Export is processed synchronously (may take 10-30 seconds)
- All contacts are loaded into memory before CSV generation
- Consider implementing pagination or streaming for very large datasets

### Optimization Tips

1. **Filter Early:** Use specific filters to reduce export size
2. **Scheduled Exports:** Run exports during off-peak hours
3. **Caching:** Download URLs are cached for 15 minutes - share the same URL

## 🐛 Troubleshooting

### "No contacts found" Error

**Cause:** No contacts match your filter criteria

**Solution:** 
- Check filter values (typos in status names)
- Verify campaign has contacts
- Remove filters to see all contacts

### "Campaign not found" Error

**Cause:** Invalid campaign ID

**Solution:** Verify the campaign ID is correct

### Download URL Expired

**Cause:** Presigned URL is only valid for 15 minutes

**Solution:** Re-request the export to get a new download URL

### Export Takes Too Long

**Cause:** Very large dataset

**Solution:**
- Use more specific filters to reduce export size
- Consider exporting in smaller batches
- Check server logs for processing time

## 📊 Export Use Cases

### 1. Client Delivery Workflow

```
1. Filter: ready-for-delivery
2. Download CSV
3. Deliver to client
4. Mark as submitted
```

### 2. External Email Validation

```
1. Export eligible contacts
2. Validate with external service (ZeroBounce, NeverBounce)
3. Upload validation results
4. Export validated contacts for delivery
```

### 3. Quality Assurance

```
1. Export: verificationStatus = "To_Review"
2. Manual review in spreadsheet
3. Update statuses via bulk upload
4. Export validated results
```

### 4. Campaign Analytics

```
1. Export all contacts (including deleted)
2. Analyze in Excel/BI tool
3. Generate reports on:
   - Eligibility rates
   - Email validation pass rates
   - Geographic distribution
   - Title distribution
```

## 🔄 Integration with Existing Workflows

### With EmailListVerify

```bash
# 1. Export eligible contacts
POST /api/verification-campaigns/{id}/export/eligible

# 2. Validate with ELV (external)

# 3. Upload validation results
POST /api/verification-campaigns/{id}/contacts/bulk-verify-emails

# 4. Export ready-for-delivery
POST /api/verification-campaigns/{id}/export/ready-for-delivery
```

### With Submission Buffer

```bash
# 1. Lock contacts in buffer
POST /api/verification-campaigns/{id}/submission/lock

# 2. Export buffer
POST /api/verification-campaigns/{id}/export/submission-buffer

# 3. Deliver to client

# 4. Clear buffer
POST /api/verification-campaigns/{id}/submission/clear
```

## 📝 Next Steps

- Integrate export functionality into your verification campaign UI
- Set up automated exports for recurring campaigns
- Create custom export templates for different client requirements
- Monitor export job performance and optimize as needed
