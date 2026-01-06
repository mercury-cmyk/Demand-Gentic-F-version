# Phase 4: Integration Architecture Diagram

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EMAIL CAMPAIGN CREATION FLOW                         │
└─────────────────────────────────────────────────────────────────────────────┘

                          USER INTERFACE LAYER
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐  │
│  │   Step 1         │  │   Step 2         │  │   Step 3-5             │  │
│  │ AUDIENCE         │  │  EMAIL CONTENT   │  │  SCHEDULING/COMPLIANCE │  │
│  │ Selection        │  │  (ENHANCED)      │  │  SUMMARY               │  │
│  ├──────────────────┤  ├──────────────────┤  ├────────────────────────┤  │
│  │ ✓ Segment        │  │ EmailBuilderClean│  │ ✓ Send Time            │  │
│  │ ✓ Filters        │  │ ├─ Visual Editor │  │ ✓ Compliance Checks    │  │
│  │ ✓ Lists          │  │ ├─ Code Editor   │  │ ✓ Campaign Review      │  │
│  │ ✓ Domain Sets    │  │ └─ Preview       │  │ ✓ Launch               │  │
│  │                  │  │                  │  │                        │  │
│  │ AUDIENCE         │  │ Sender Profiles  │  │ Campaign Data          │  │
│  │ [10,000 contacts]│  │ [Selector]       │  │ [Accumulated]          │  │
│  │                  │  │                  │  │                        │  │
│  │ onNext() ────────┼─→│ Templates Modal  │  │                        │  │
│  │                  │  │ [Loading]        │  │                        │  │
│  │ audience: {}     │  │                  │  │                        │  │
│  │                  │  │ Test Email Modal │  │                        │  │
│  │                  │  │ [Sending]        │  │                        │  │
│  │                  │  │                  │  │                        │  │
│  │                  │  │ onNext() ────────┼─→│ (flows through steps)  │  │
│  │                  │  │                  │  │                        │  │
│  │                  │  │ content: {       │  │ onComplete() ──────┐   │  │
│  │                  │  │   subject,       │  │                    │   │  │
│  │                  │  │   preheader,     │  │                    │   │  │
│  │                  │  │   html,          │  │                    │   │  │
│  │                  │  │   design,        │  │                    │   │  │
│  │                  │  │   senderProf... │  │                    │   │  │
│  │                  │  │ }                │  │                    │   │  │
│  └──────────────────┘  └──────────────────┘  └────────────────────────┘  │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │ CampaignWizard (Orchestration Layer)                              │   │
│  │ ─────────────────────────────────────────────────────────────────  │   │
│  │ State:                                                             │   │
│  │   currentStep: string                                             │   │
│  │   campaignData: { audience, content, scheduling, compliance }    │   │
│  │   completedSteps: Set<string>                                     │   │
│  │                                                                    │   │
│  │ Flow:                                                              │   │
│  │   [1] Collect audience data                                       │   │
│  │   [2] Collect email content (← Enhanced with builder)             │   │
│  │   [3] Collect scheduling config                                   │   │
│  │   [4] Run compliance checks                                       │   │
│  │   [5] Review & Submit ──────────────→ onComplete()               │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                           API INTEGRATION LAYER
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   GET /api/sender-profiles          GET /api/email-templates               │
│   ┌──────────────────────┐          ┌──────────────────────┐               │
│   │ [                    │          │ [                    │               │
│   │   {                  │          │   {                  │               │
│   │     id: "prof-1",    │          │     id: "tmpl-1",    │               │
│   │     name: "Support", │          │     name: "Welcome", │               │
│   │     email: "...",    │          │     subject: "...",  │               │
│   │     verified: true   │          │     htmlContent: ... │               │
│   │   }                  │          │   }                  │               │
│   │ ]                    │          │ ]                    │               │
│   └──────────────────────┘          └──────────────────────┘               │
│           ↑                                     ↑                           │
│           │ (on component load)                │ (template selector)       │
│           │                                     │                          │
│   ┌──────────────────────────────────────────────────────┐                │
│   │ Step2EmailContentEnhanced (Our New Component)        │                │
│   │ ───────────────────────────────────────────────────  │                │
│   │ Props:                                               │                │
│   │   data: { audience, content }                        │                │
│   │   onNext: (stepData) => void                         │                │
│   │   onBack: () => void                                 │                │
│   │                                                      │                │
│   │ State:                                               │                │
│   │   subject, preheader, htmlContent, design            │                │
│   │   senderProfileId, sampleContacts                    │                │
│   │   validationErrors, showTemplateSelector, etc.       │                │
│   │                                                      │                │
│   │ Output (onNext):                                     │                │
│   │   {                                                  │                │
│   │     content: {                                       │                │
│   │       subject: string,                               │                │
│   │       preheader: string,                             │                │
│   │       html: string,                                  │                │
│   │       design: any,                                   │                │
│   │       senderProfileId: string                        │                │
│   │     }                                                │                │
│   │   }                                                  │                │
│   └──────────────────────────────────────────────────────┘                │
│           │                                                                 │
│           │ (builds email content via EmailBuilderClean)                   │
│           │                                                                 │
│           ├──→ POST /api/campaigns/send-test                              │
│           │    ┌──────────────────────────────┐                            │
│           │    │ {                            │                            │
│           │    │   emails: [...],             │                            │
│           │    │   subject: string,           │                            │
│           │    │   html: string,              │                            │
│           │    │   senderProfileId: string    │                            │
│           │    │ }                            │                            │
│           │    └──────────────────────────────┘                            │
│           │    ↓                                                            │
│           │    Sends test emails with:                                     │
│           │    • Personalization tokens replaced                           │
│           │    • Tracking pixels injected                                  │
│           │    • Compliance footer added                                   │
│           │                                                                 │
│           └──→ (form data flows to Step 3)                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                           CAMPAIGN SUBMISSION LAYER
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   At Step 5 Summary → User clicks "Launch Campaign"                         │
│   ↓                                                                          │
│   POST /api/campaigns (CAMPAIGN CREATION)                                  │
│   ┌─────────────────────────────────────────────────────────┐              │
│   │ {                                                        │              │
│   │   name: "Q1 Newsletter",                                │              │
│   │   type: "email",                                        │              │
│   │   status: "active",                                     │              │
│   │   audienceRefs: { segments: [...] },                    │              │
│   │   emailSubject: "Q1 Newsletter",      ← from Step 2     │              │
│   │   emailHtmlContent: "<html>...",      ← from Step 2     │              │
│   │   emailPreheader: "Check out...",     ← from Step 2     │              │
│   │   senderProfileId: "prof-1",          ← from Step 2     │              │
│   │   scheduleJson: { ... },              ← from Step 3     │              │
│   │   throttlingConfig: { ... }           ← from Step 3     │              │
│   │ }                                                        │              │
│   └─────────────────────────────────────────────────────────┘              │
│   ↓                                                                          │
│   Database: Create campaign record                                          │
│   ↓                                                                          │
│   POST /api/campaigns/:id/send (CAMPAIGN EXECUTION)                        │
│   ┌─────────────────────────────────────────────────────────┐              │
│   │ Server-Side Email Processing:                           │              │
│   │                                                          │              │
│   │ 1. Fetch campaign from database                         │              │
│   │ 2. Resolve sender profile (get SMTP credentials)        │              │
│   │ 3. Fetch contacts from audience                         │              │
│   │ 4. For each contact:                                    │              │
│   │    ├─ Replace personalization tokens                    │              │
│   │    ├─ Check suppression list                            │              │
│   │    ├─ Call email-renderer.ts:                           │              │
│   │    │  ├─ addTrackingPixel()                             │              │
│   │    │  ├─ wrapLinksWithTracking()                        │              │
│   │    │  ├─ generateComplianceFooter()                     │              │
│   │    │  └─ htmlToPlaintext()                              │              │
│   │    └─ Queue in BullMQ                                   │              │
│   │ 5. Return success response                              │              │
│   └─────────────────────────────────────────────────────────┘              │
│   ↓                                                                          │
│   BullMQ Queue:                                                             │
│   ┌─────────────────────────────────────────────────────────┐              │
│   │ Job Queue: campaign-emails-[campaign-id]               │              │
│   │ ─────────────────────────────────────────────           │              │
│   │                                                          │              │
│   │ Job 1: Send to contact@example.com                     │              │
│   │ Job 2: Send to user@company.com                        │              │
│   │ Job 3: Send to admin@org.com                           │              │
│   │ ...                                                     │              │
│   │                                                          │              │
│   │ Workers: Process jobs in parallel                       │              │
│   │ ├─ Worker 1: Processing Job 1                          │              │
│   │ ├─ Worker 2: Processing Job 2                          │              │
│   │ └─ Worker 3: Processing Job 3                          │              │
│   │                                                          │              │
│   │ Each job:                                               │              │
│   │ • Connect to SMTP provider                              │              │
│   │ • Send rendered email                                   │              │
│   │ • Log delivery status                                   │              │
│   │ • Update campaign metrics                               │              │
│   └─────────────────────────────────────────────────────────┘              │
│   ↓                                                                          │
│   Email Delivery:                                                           │
│   • Emails sent via SMTP provider                                          │
│   • Tracking pixel captured on opens                                       │
│   • Click links tracked via redirect service                               │
│   • Bounces handled by provider webhooks                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                        BACKEND EMAIL RENDERING ENGINE
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  email-renderer.ts (273 lines)                                             │
│  ────────────────────────────────────────────────────────────────          │
│                                                                             │
│  Function: replacePersonalizationTokens(html, contact)                    │
│  ─────────────────────────────────────────────────────────────            │
│  Input:  "<p>Hello {{first_name}}, welcome to {{company}}</p>"          │
│          contact: { firstName: "John", company: "Acme" }                  │
│  Output: "<p>Hello John, welcome to Acme</p>"                            │
│                                                                             │
│  20+ Supported Tokens:                                                     │
│  {{first_name}}, {{last_name}}, {{email}}, {{company}},                  │
│  {{job_title}}, {{phone}}, {{department}}, {{industry}},                 │
│  {{account_name}}, {{account_website}}, ... custom fields                 │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────        │
│                                                                             │
│  Function: addTrackingPixel(html, trackingId)                            │
│  ─────────────────────────────────────────────────────────────            │
│  Input:  "<html><body>...</body></html>"                                 │
│  Output: "<html><body>...<img src='https://api/.../track/[id]' /></body>"│
│  Result: Tracks when email is opened                                      │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────        │
│                                                                             │
│  Function: wrapLinksWithTracking(html, trackingId)                       │
│  ─────────────────────────────────────────────────────────────            │
│  Input:  "<a href='https://example.com'>Click here</a>"                  │
│  Output: "<a href='https://api/.../track/link/[id]?url=...'>"           │
│  Result: Tracks when links are clicked                                    │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────        │
│                                                                             │
│  Function: generateComplianceFooter(senderInfo, unsubscribeLink)         │
│  ─────────────────────────────────────────────────────────────            │
│  Output: Adds to email footer:                                            │
│          • Sender company & address                                       │
│          • Unsubscribe link (mailto: or one-click)                        │
│          • Privacy policy link                                            │
│          • "Sent by Pivotal Marketing" badge                              │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────        │
│                                                                             │
│  Function: htmlToPlaintext(html)                                         │
│  ─────────────────────────────────────────────────────────────            │
│  Input:  "<html><body><h1>Title</h1><p>Content</p></body></html>"       │
│  Output: "Title\n\nContent"                                              │
│  Result: Generates plain text version for email clients                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Integration Map

```
Step2EmailContentEnhanced
│
├─ INPUT PROPS
│  ├─ data.audience.sampleContacts
│  └─ data.content (previous step data if editing)
│
├─ CHILD COMPONENTS
│  ├─ EmailBuilderClean
│  │  ├─ EmailCanvas (GrapesJS visual editor)
│  │  ├─ HtmlCodeEditor (Monaco HTML editor)
│  │  ├─ SimpleEmailCanvas (content editable)
│  │  └─ EmailPreview (multi-device preview)
│  │
│  ├─ TemplateSelectorModal
│  │  └─ Calls: GET /api/email-templates
│  │
│  ├─ SendTestEmailModal
│  │  └─ Calls: POST /api/campaigns/send-test
│  │
│  └─ EmailPreview (standalone)
│     └─ Used in Preview tab
│
├─ API CALLS
│  ├─ GET /api/sender-profiles (on mount)
│  ├─ GET /api/email-templates (template modal)
│  └─ POST /api/campaigns/send-test (test email)
│
└─ OUTPUT (onNext callback)
   {
     content: {
       subject: string,
       preheader: string,
       html: string,
       design: object,
       senderProfileId: string
     }
   }
```

## Data Structure Throughout Campaign Creation

```
Step 1 Output:
{
  audience: {
    source: "segment" | "list" | "filters" | "domain_set",
    selectedSegments: ["seg-1", "seg-2"],
    selectedLists: [],
    filterGroup: { ... },
    excludedSegments: [],
    sampleContacts: [
      { id: "1", firstName: "John", lastName: "Doe", email: "...", company: "Acme" },
      { id: "2", firstName: "Jane", lastName: "Smith", email: "...", company: "Tech" }
    ],
    audienceSize: 10000
  }
}

Step 2 Output:
{
  content: {
    subject: "Q1 Newsletter",
    preheader: "Check out our updates",
    html: "<html><body>...</body></html>",
    design: { /* GrapesJS design object */ },
    senderProfileId: "prof-1"
  }
}

Step 3 Output:
{
  scheduling: {
    type: "immediate" | "scheduled",
    date: "2024-01-15",
    time: "09:00",
    timezone: "America/New_York",
    throttle: 1000
  }
}

Step 4 Output:
{
  compliance: {
    verificationChecks: {
      spamRisk: "low",
      linkValidation: "passed",
      unsubscribeLink: "present",
      senderVerified: true
    }
  }
}

Step 5 (Final Data Combined):
{
  type: "email",
  name: "Q1 Newsletter",
  audience: { ... from Step 1 },
  content: { ... from Step 2 },
  scheduling: { ... from Step 3 },
  compliance: { ... from Step 4 },
  action: "launch" | "draft"
}
```

## API Call Timeline

```
Timeline of API Calls During Campaign Creation

T=0s    │ User navigates to /campaigns/email/create
        ↓
T=0.5s  │ Step2EmailContentEnhanced component mounts
        │ → GET /api/sender-profiles
        ↓
T=1s    │ Sender profiles dropdown populated
        │ → First verified profile auto-selected
        ↓
T=2-5s  │ User designs email in EmailBuilderClean
        │ (no API calls during editing)
        ↓
T=5.5s  │ User clicks "Browse Templates" button
        │ → GET /api/email-templates
        ↓
T=6s    │ Templates loaded in TemplateSelectorModal
        │ → User selects template
        ↓
T=7s    │ Template content loads into builder
        ↓
T=8s    │ User clicks "Send Test Email" button
        │ → POST /api/campaigns/send-test
        │ → Test emails rendered with personalization
        │ → Test emails queued for delivery
        ↓
T=9s    │ Test email confirmation
        ↓
T=10s   │ User clicks "Continue to Scheduling"
        │ (Form data passed through wizard state)
        ↓
T=11-20s│ Steps 3-5: Scheduling, Compliance, Summary
        │ (Wizard accumulates data, no new API calls)
        ↓
T=20.5s │ User clicks "Launch Campaign"
        │ → POST /api/campaigns
        │ (Includes all data from Steps 1-5)
        ↓
T=21s   │ Campaign created, returns campaignId
        │ → POST /api/campaigns/:id/send
        │ (Backend triggers email processing)
        ↓
T=22s   │ Campaign queued in BullMQ
        │ → Workers begin processing emails
        ↓
T=23-60s│ Emails sent via SMTP provider
        │ • Personalization tokens replaced
        │ • Tracking pixels injected
        │ • Compliance footers added
        │ • Open tracking setup
        │ • Click tracking setup
        ↓
T=60s+  │ Campaign status: "Active"
        │ → User redirected to campaign list
        │ → Email delivery continues in background
```

## Error Handling Flow

```
Validation Errors in Step 2:

1. Missing Subject
   └─ Show: "Subject line is required"
   └─ Block: Continue button disabled
   └─ Fix: User enters subject, error clears

2. Missing HTML Content
   └─ Show: "Email content is required"
   └─ Block: Continue button disabled
   └─ Fix: User creates content in builder, error clears

3. Missing Sender Profile
   └─ Show: "Sender profile must be selected"
   └─ Block: Continue button disabled
   └─ Fix: User selects sender, error clears

4. Unverified Sender Selected
   └─ Show: Warning badge (not blocking)
   └─ Info: "This sender has not been verified. Emails may have lower deliverability."
   └─ Allow: User can continue but with warning
   └─ Recommendation: Select verified sender first

Test Email Errors:

1. Invalid Email Address
   └─ Show: Toast error "Invalid email address"
   └─ User: Correct email and retry

2. Sender Profile Error
   └─ Show: Toast error "Sender profile not found"
   └─ User: Select different sender

3. Test Email Send Fails
   └─ Show: Toast error with server message
   └─ User: Check logs, verify sender setup

Campaign Creation Errors:

1. Audience Empty
   └─ Caught: In Step 1 validation
   └─ Show: Error before proceeding to Step 2

2. SMTP Provider Down
   └─ Show: Toast error "Failed to send test email"
   └─ User: Check service status

3. Database Error
   └─ Show: Toast error "Failed to create campaign"
   └─ User: Retry or contact support

4. Throttle Config Invalid
   └─ Show: Toast error "Invalid throttle configuration"
   └─ User: Review scheduling step
```

This architecture ensures:
✅ Clean separation of concerns (UI ↔ API ↔ Business Logic)
✅ Proper data flow through wizard (unidirectional)
✅ Full email rendering pipeline (personalization → tracking → compliance)
✅ Robust error handling at each step
✅ Scalable BullMQ job processing
✅ Reliable sender management
