# Integration Testing Guide
## Email Verification & AI Enrichment

### ✅ Backend Status
Both integrations are **fully functional** and tested:

1. **EmailListVerify API** ✅
   - API Key: Configured
   - Endpoint: Working
   - Test result: Successfully validates emails

2. **Replit AI (OpenAI)** ✅  
   - API configured (Replit's AI Integrations service)
   - Model: GPT-4o
   - Test result: Successfully enriches company data

3. **Brave Search API** ✅
   - API Key: Configured
   - Fallback enrichment: Available
   - Test result: Successfully searches web

---

## 🧪 How to Test Features in UI

### Testing Email Verification

#### **Individual Email Validation** (via Contact Detail Panel)
1. Navigate to **Data Verification** → Select a campaign
2. Click on any contact in the queue
3. In the contact detail panel, go to **"Company" tab**
4. Look for "Validate Email with ELV" button
5. Click to validate

**Prerequisites for Individual Validation:**
- Contact must be **Eligible**
- Contact must be **Validated** (verification status)
- Contact must **NOT be suppressed**
- Contact must have an **email address**

#### **Bulk Email Validation** (via Bulk Actions)
1. Navigate to **Data Verification** → Select a campaign
2. **Select contacts** using checkboxes (⚠️ Must select at least 1 contact!)
3. Click **"Validate Emails"** button in the bulk actions toolbar
4. A background job will process the emails in batches
5. Watch for progress indicator showing: "Batch X/Y | X/Y contacts | X% complete"

**How Bulk Validation Works:**
- Processes 500 contacts per batch
- Rate limited: 5 requests/second to EmailListVerify
- Results cached for 60 days
- Background job with progress tracking

---

### Testing AI Enrichment

#### **Campaign-Wide Enrichment** (via Campaign Actions)
1. Navigate to **Data Verification** → Select a campaign
2. Look for the **"Enrich Company Data"** button (usually in toolbar or actions)
3. Click to open enrichment dialog
4. Configure settings:
   - **Batch Size**: 10-50 recommended (default: 50)
   - **Delay**: 1000-2000ms between batches (default: 1500ms)
5. Click **"Start Enrichment"**
6. Watch for progress updates

**Campaign-Wide Enrichment Process:**
- **Stage 1**: AI uses internal training data to find LOCAL office info
- **Stage 2**: If AI confidence < 70%, automatically searches web (Brave Search)
- Only enriches contacts with **emailStatus = 'ok'**
- Only saves results with **confidence ≥ 70%**
- Enriches both address AND phone in single request

#### **Bulk Enrichment** (Selected Contacts Only)
1. Navigate to **Data Verification** → Select a campaign
2. **Select specific contacts** using checkboxes (⚠️ Must select at least 1!)
3. Click **"Enrich Data"** button in bulk actions toolbar
4. Watch for toast notification showing enrichment results

**What Gets Enriched:**
- **Address fields**: Contact Address 1-3, City, State, Postal Code, Country (saved to contactAddress* fields)
- **Phone field**: HQ Phone (local office number) - saved to `hqPhone` field
- **Smart filtering**: Only enriches INCOMPLETE data unless force=true

**Where to See Enriched Data:**
- **Company Tab** → "HQ Phone (Enriched)" field shows the enriched phone
- **Company Tab** → Address fields show enriched local office address

**Enrichment Requirements:**
- Contact must be **Eligible**
- Contact must have **emailStatus = 'ok'** (valid email)
- Contact must **NOT be suppressed**
- Contact must be **NOT deleted**

---

## 🔍 Common Issues & Solutions

### Issue: "No contacts selected" or buttons disabled
**Solution:** You must **select contacts first** using the checkboxes!
- Look for checkboxes in the leftmost column of the contact table
- Select at least 1 contact before clicking bulk action buttons
- Selected count badge should show: "X selected"

### Issue: Email validation returns "Preconditions not met"
**Solution:** Check the contact meets all requirements:
```
✅ eligibilityStatus = 'Eligible'
✅ verificationStatus = 'Validated' 
✅ suppressed = false
✅ email exists
```

### Issue: Enrichment returns no results
**Possible causes:**
1. **Contact already has complete data** → Enrichment skips (not an error)
2. **Email status is not 'ok'** → Only enriches contacts with valid emails
3. **AI couldn't find data** → Company might not be in AI's knowledge base
4. **Confidence too low** → Results below 70% confidence are rejected

**Solution for low confidence:**
- Try enabling Brave Search API fallback (already configured!)
- Check if company name is spelled correctly
- Verify contactCountry is set correctly

### Issue: Can't find the enrichment button
**Where to look:**
- **Bulk actions toolbar** (appears when contacts selected)
- **Campaign header/toolbar** (campaign-wide enrichment)
- Icon: ✨ Sparkles icon
- Label: "Enrich Data" or "Enrich Company Data"

---

## 📊 Monitoring & Debugging

### Check Backend Logs
Run the diagnostic script:
```bash
tsx server/test-integrations.ts
```

### Check Browser Console
1. Open Developer Tools (F12)
2. Go to **Console** tab
3. Look for error messages starting with:
   - `[CompanyEnrichment]`
   - `[EMAIL VALIDATION JOB]`
   - Error toasts from mutations

### Check Network Requests
1. Open Developer Tools (F12)
2. Go to **Network** tab
3. Look for failed requests to:
   - `/api/verification-contacts/:id/validate-email`
   - `/api/verification-campaigns/:campaignId/enrich`
   - `/api/verification-campaigns/:campaignId/contacts/bulk-verify-emails`
   - `/api/verification-campaigns/:campaignId/contacts/bulk-enrich`

### Typical Success Flow

**Email Validation:**
```
1. POST /api/verification-campaigns/:id/contacts/bulk-verify-emails
   → Response: { jobId, totalContacts, totalBatches }
   
2. Frontend polls: GET /api/verification-email-validation-jobs/:jobId
   → Checks progress every 2 seconds
   
3. Background job processes batches:
   → Batch 1/5 | 100/500 contacts | 20% complete
   → Batch 2/5 | 200/500 contacts | 40% complete
   ...
   
4. Job completes:
   → status: 'completed'
   → Results cached in verification_email_validations table
```

**AI Enrichment:**
```
1. POST /api/verification-campaigns/:id/enrich
   → Body: { batchSize: 50, delayMs: 1500 }
   
2. Backend processes in batches:
   [CompanyEnrichment] Stage 1: Trying AI internal knowledge for "Microsoft" in Singapore
   [CompanyEnrichment] Stage 1 SUCCESS - AI found data (address: true, phone: true)
   
3. Frontend receives response:
   → { addressEnriched: 45, phoneEnriched: 38, failed: 7 }
   
4. Toast notification:
   → "Enriched 45 addresses and 38 phone numbers"
```

---

## 🎯 Quick Test Checklist

- [ ] Create or select a verification campaign
- [ ] Upload contacts (with emails and contactCountry)
- [ ] Select at least 1 contact using checkbox
- [ ] Click **"Validate Emails"** button
- [ ] Verify progress indicator appears
- [ ] Wait for completion toast
- [ ] Select contacts with valid emails (emailStatus = 'ok')
- [ ] Click **"Enrich Data"** button  
- [ ] Verify enrichment results in toast
- [ ] Open contact detail to see enriched data

---

## 💡 Pro Tips

1. **Start small**: Test with 5-10 contacts first before processing thousands
2. **Check email status first**: Only contacts with 'ok' emails will be enriched
3. **Use filters**: Filter by `emailStatus = 'ok'` before enrichment to avoid wasting API calls
4. **Monitor costs**: Each EmailListVerify call costs credits - batch validation is more efficient
5. **Brave Search fallback**: Automatically tries web search if AI confidence < 70%

---

## 📞 Support

If features still aren't working:
1. Check browser console for errors
2. Run `tsx server/test-integrations.ts` to verify backend
3. Share error messages or screenshots for debugging

---

**Last Updated:** October 21, 2025  
**Status:** ✅ All integrations verified and working
