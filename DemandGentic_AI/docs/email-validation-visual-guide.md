# Email Validation Visual Workflow Guide

## 🎯 Choose Your Method

```
┌─────────────────────────────────────────────────────────────────┐
│                   EMAIL VALIDATION METHODS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  METHOD 1: Automated API          METHOD 2: External Manual     │
│  ✅ EmailListVerify API           ✅ Any validation service     │
│  ⚡ Fast & Automated              🎯 Full control              │
│  💰 Smart caching                 📋 Manual review              │
│  🔄 Background jobs               🔧 Batch processing           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Method 1: Automated API Validation Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    AUTOMATED VALIDATION                           │
└──────────────────────────────────────────────────────────────────┘

     ┌─────────────────┐
     │ Verification    │
     │ Console         │
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐
     │ Click "Bulk     │
     │ Validate Emails"│
     └────────┬────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ System Creates Background Job        │
     │ ┌─────────────────────────────────┐ │
     │ │ • Enforces per-account caps     │ │
     │ │ • Checks 90-day cache          │ │
     │ │ • Batches API calls (500/batch)│ │
     │ └─────────────────────────────────┘ │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ Background Processing                │
     │ ┌─────────────────────────────────┐ │
     │ │ For each contact:               │ │
     │ │   • Check cache (90 days)       │ │
     │ │   • Call API if needed          │ │
     │ │   • Update emailStatus field    │ │
     │ │   • Store in cache              │ │
     │ └─────────────────────────────────┘ │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ Monitor Real-Time Progress           │
     │ • Batch X of Y                       │
     │ • Success/Failure counts             │
     │ • Status distribution (ok/invalid)   │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ ✅ COMPLETE                          │
     │ • Contacts updated with emailStatus  │
     │ • Ready for export/delivery          │
     └──────────────────────────────────────┘

   💡 TIP: Jobs auto-resume after server restart!
```

---

## Method 2: External Validation Workflow

```
┌──────────────────────────────────────────────────────────────────┐
│              EXTERNAL VALIDATION WORKFLOW                         │
└──────────────────────────────────────────────────────────────────┘


STEP 1: EXPORT ELIGIBLE CONTACTS
─────────────────────────────────────────────────────────────────

     ┌─────────────────────────────────────┐
     │ Submission Manager                   │
     │ Click "Export Eligible Contacts"     │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ System Filters:                      │
     │ ✓ verificationStatus = 'Validated'   │
     │ ✓ eligibilityStatus = 'Eligible'     │
     │ ✓ suppressed = false                 │
     │ ✓ deleted = false                    │
     │ ✓ Account under leadCapPerAccount    │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ 📥 Download CSV                      │
     │ • contact_name.csv                   │
     │ • Contains: email, name, company...  │
     └──────────────────────────────────────┘


STEP 2: EXTERNAL VALIDATION (Manual)
─────────────────────────────────────────────────────────────────

     ┌─────────────────────────────────────┐
     │ Upload CSV to Validation Service:    │
     │ • EmailListVerify.com                │
     │ • ZeroBounce                         │
     │ • NeverBounce                        │
     │ • Hunter.io                          │
     │ • Any other service                  │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ ⏳ Wait for validation results       │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ 📥 Download validated results        │
     │ • validated_results.csv              │
     │ Required: email, emailStatus columns │
     └──────────────────────────────────────┘


STEP 3: UPLOAD VALIDATION RESULTS
─────────────────────────────────────────────────────────────────

     ┌─────────────────────────────────────┐
     │ Verification Console                 │
     │ Click "Import CSV"                   │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ Upload validated_results.csv         │
     │ Map columns:                         │
     │ • email → Email                      │
     │ • emailStatus → Email Status         │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ System Processing:                   │
     │ • Matches by email address           │
     │ • Updates emailStatus field          │
     │ • Handles 2,500 contacts per batch   │
     │ • Smart deduplication                │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ ✅ Upload Complete                   │
     │ • X contacts updated                 │
     └──────────────────────────────────────┘


STEP 4: LOCK VALIDATED CONTACTS
─────────────────────────────────────────────────────────────────

     ┌─────────────────────────────────────┐
     │ Submission Manager                   │
     │ Click "Lock Validated Contacts"      │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ System Selects:                      │
     │ ✓ emailStatus = 'ok'                 │
     │ ✓ verificationStatus = 'Validated'   │
     │ ✓ eligibilityStatus = 'Eligible'     │
     │ ✓ suppressed = false                 │
     │ ✓ inSubmissionBuffer = false         │
     │ ✓ Account under leadCapPerAccount    │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ For each selected contact:           │
     │ 1. Create submission record          │
     │ 2. Set inSubmissionBuffer = true     │
     │ 3. Lock for delivery                 │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ ✅ Buffer Prepared                   │
     │ • X contacts locked for delivery     │
     └──────────────────────────────────────┘


STEP 5: EXPORT FOR CLIENT DELIVERY
─────────────────────────────────────────────────────────────────

     ┌─────────────────────────────────────┐
     │ Submission Manager                   │
     │ Click "Export Buffered Leads"        │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ System Exports:                      │
     │ • Only inSubmissionBuffer = true     │
     │ • Enriched with company data         │
     │ • Client-ready format                │
     │ • Template: enriched or client_cav   │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ 📥 Download final-delivery.csv       │
     │ • Send to client via email/FTP       │
     └──────────────────────────────────────┘


STEP 6: CLEAR BUFFER
─────────────────────────────────────────────────────────────────

     ┌─────────────────────────────────────┐
     │ After successful client delivery     │
     │ Click "Clear Buffer"                 │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ Confirm dialog                       │
     │ "Clear submission buffer?"           │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ System Actions:                      │
     │ • Set inSubmissionBuffer = false     │
     │ • Keep submission records (audit)    │
     │ • Ready for next batch               │
     └────────┬────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ ✅ Buffer Cleared                    │
     │ • Ready for next export cycle        │
     └──────────────────────────────────────┘
```

---

## 🔒 Per-Account Cap Enforcement

```
┌──────────────────────────────────────────────────────────────────┐
│              HOW CAPS ARE ENFORCED                                │
└──────────────────────────────────────────────────────────────────┘

Campaign Setting: leadCapPerAccount = 5
─────────────────────────────────────────────────────────────────

Example: Acme Corp has 10 validated contacts

     ┌─────────────────────────────────────┐
     │ Database Query (Window Function):    │
     │                                      │
     │ WITH ranked AS (                     │
     │   SELECT                             │
     │     contact_id,                      │
     │     account_id,                      │
     │     ROW_NUMBER() OVER (              │
     │       PARTITION BY account_id        │
     │       ORDER BY priority_score DESC   │
     │     ) as rank,                       │
     │     (SELECT COUNT(*)                 │
     │      FROM submissions                │
     │      WHERE account_id = c.account_id │
     │      AND campaign_id = X) as count   │
     │   FROM contacts c                    │
     │   WHERE eligible = true              │
     │ )                                    │
     │ SELECT * FROM ranked                 │
     │ WHERE rank <= (5 - count)            │
     │   AND count < 5                      │
     └──────────────────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────┐
     │ Results:                             │
     │ • 0 already submitted → 5 exported   │
     │ • 2 already submitted → 3 exported   │
     │ • 5 already submitted → 0 exported   │
     │ ✅ Never exceeds cap!                │
     └──────────────────────────────────────┘

Enforcement Points:
──────────────────────────────────────────────────────────────────

METHOD 1 (Automated):
  ✓ During validation queue selection
  ✓ Before API calls are made

METHOD 2 (External):
  ✓ Step 1: Export (limits what you download)
  ✓ Step 4: Buffer prep (double-checks before locking)

Database Table: verification_lead_submissions
  • Permanent record of all submissions
  • Used for cap calculations
  • Audit trail with timestamps
```

---

## 📊 Database Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    DATABASE INTERACTIONS                          │
└──────────────────────────────────────────────────────────────────┘


┌────────────────────────┐
│ verification_contacts  │     Main contact record
├────────────────────────┤
│ id                     │
│ email                  │
│ emailStatus ◄──────────┼─── Updated by validation
│ verificationStatus     │     (ok/invalid/risky/unknown)
│ eligibilityStatus      │
│ suppressed             │
│ inSubmissionBuffer ◄───┼─── Set by Step 4 (External only)
│ priorityScore          │
│ accountId              │
└────────┬───────────────┘
         │
         │
         ▼
┌────────────────────────────┐
│ verification_email_        │   90-day cache
│ validations                │   (Method 1 only)
├────────────────────────────┤
│ contactId                  │
│ status                     │
│ checkedAt ◄────────────────┼─── Cache timestamp
│ rawJson                    │       Smart caching!
└────────────────────────────┘


┌────────────────────────────┐
│ verification_lead_         │   Submission tracking
│ submissions                │   (Both methods)
├────────────────────────────┤
│ id                         │
│ contactId                  │
│ accountId ◄────────────────┼─── Used for cap checks
│ campaignId                 │
│ createdAt                  │
│ deliveredAt                │     Optional timestamp
└────────────────────────────┘


┌────────────────────────────┐
│ verification_email_        │   Job tracking
│ validation_jobs            │   (Method 1 only)
├────────────────────────────┤
│ id                         │
│ campaignId                 │
│ status                     │     processing/completed/failed
│ totalContacts              │
│ processedContacts          │
│ currentBatch               │
│ successCount               │
│ failureCount               │
│ statusCounts               │     {ok: X, invalid: Y, risky: Z}
└────────────────────────────┘
```

---

## 🎨 UI Components

```
┌──────────────────────────────────────────────────────────────────┐
│              VERIFICATION CONSOLE UI                              │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Verification Console - Campaign Name                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📊 STATS CARDS (5 cards across)                                │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────────────┐ ┌──────────┐       │
│  │Eligible│Validated│OK Rate│Deliverability│Submissions│       │
│  └──────┘ └──────┘ └──────┘ └────────────┘ └──────────┘       │
│                                                                  │
│  📤 SUBMISSION MANAGER                                          │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Step 1        Step 2         Step 3         Step 4        │ │
│  │ Export        Lock           Export         Clear         │ │
│  │ [📥 Button]   [🔒 Button]    [📥 Button]    [🗑️ Button]   │ │
│  │ Description   Description    Description   Description    │ │
│  └───────────────────────────────────────────────────────────┘ │
│  └─ Workflow summary with inline help ──────────────────────┘  │
│                                                                  │
│  📋 VERIFICATION QUEUE                                          │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ [Export Validated+Verified] [Show Filters]                │ │
│  │                                                            │ │
│  │ Contact List...                                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

💡 All buttons include:
   • Clear labels
   • Icon indicators
   • Help text below
   • Toast notifications on success
   • Error handling
```

---

## ✅ Decision Tree: Which Method to Use?

```
                    Start Here
                        │
                        ▼
          ┌─────────────────────────┐
          │ Do you have             │
          │ EMAIL_LIST_VERIFY_KEY?  │
          └───────┬─────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
       YES                 NO
        │                   │
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│ Need speed    │   │ Use METHOD 2     │
│ & automation? │   │ External Manual  │
└───────┬───────┘   └──────────────────┘
        │
   ┌────┴────┐
  YES       NO
   │         │
   ▼         ▼
┌─────────┐ ┌───────────────┐
│METHOD 1 │ │ Want manual   │
│Auto API │ │ review/control?│
└─────────┘ └───────┬───────┘
                    │
               ┌────┴────┐
              YES       NO
               │         │
               ▼         ▼
        ┌──────────┐ ┌─────────┐
        │METHOD 2  │ │METHOD 1 │
        │External  │ │Auto API │
        └──────────┘ └─────────┘

Recommendation:
• METHOD 1 for daily operations (fast, automated)
• METHOD 2 for special projects (control, any service)
• Both methods enforce caps automatically!
```

---

## 🎯 Quick Start Checklist

### Method 1 (Automated)
- [ ] Confirm EMAIL_LIST_VERIFY_KEY is configured
- [ ] Navigate to Verification Campaign
- [ ] Click "Bulk Validate Emails"
- [ ] Monitor progress
- [ ] Done!

### Method 2 (External)
- [ ] Click "Export Eligible Contacts"
- [ ] Upload to external service
- [ ] Download validation results
- [ ] Import results via CSV Import
- [ ] Click "Lock Validated Contacts"
- [ ] Click "Export Buffered Leads"
- [ ] Deliver to client
- [ ] Click "Clear Buffer"
- [ ] Done!

Both workflows are production-ready! 🚀