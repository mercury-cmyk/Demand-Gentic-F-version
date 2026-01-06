# Email Campaign System - Comprehensive Fix Plan

## Overview
This document outlines fixes for campaign reporting, audience filtering, suppression logic, and UI routing.

## 1. Email Campaign Reporting System ✅

### Current State
- Basic analytics-service.ts exists with metrics
- Mailgun webhook receives events but doesn't store them
- No comprehensive campaign reporting UI

### Required Implementation

#### A. Database Event Storage
**Location**: `server/routes.ts` - Mailgun webhook endpoint (lines 6592-6623)

**Changes needed**:
1. Create email_events table entries for each webhook event
2. Link events to campaign_id and contact_id
3. Store event metadata (IP, user agent, device type, location)

**Event Types to Track**:
- `delivered` - Email successfully delivered to recipient
- `opened` - Email opened by recipient
- `clicked` - Link clicked in email
- `bounced` - Email bounced (soft or hard)
- `complained` - Spam complaint reported
- `unsubscribed` - Recipient unsubscribed

#### B. Campaign Metrics Endpoint
**Location**: Create new endpoint `/api/campaigns/:id/email-metrics`

**Response Structure**:
```typescript
{
  totalRecipients: number;      // From campaign audience
  sent: number;                 // Successfully sent count
  delivered: number;            // Delivered events
  deliveryRate: number;         // (delivered / sent) * 100
  opened: number;               // Unique opens
  openRate: number;             // (opened / delivered) * 100
  clicked: number;              // Unique clicks
  clickRate: number;            // (clicked / opened) * 100
  bounced: number;              // Total bounces
  softBounces: number;          // Temporary delivery failures
  hardBounces: number;          // Permanent delivery failures
  bounceRate: number;           // (bounced / sent) * 100
  complained: number;           // Spam complaints
  complaintRate: number;        // (complained / delivered) * 100
  unsubscribed: number;         // Unsubscribe count
  unsubscribeRate: number;      // (unsubscribed / delivered) * 100
}
```

#### C. Reporting UI Component
**Location**: `client/src/pages/email-campaign-view.tsx`

**Features**:
- Campaign lifecycle metrics dashboard
- Real-time event tracking
- Time-series charts (opens/clicks over time)
- Contact-level event log
- Export capabilities

## 2. Automatic Suppression System ⚠️

### Current State
- verificationSuppressionList table exists for verification campaigns
- No global email suppression list
- No automatic suppression on bounce/unsubscribe

### Required Implementation

#### A. Global Email Suppression List
**Location**: Create `server/db/schema.ts` addition

**New Table**: `email_suppression_list`
```typescript
{
  id: uuid primary key
  email: varchar(320) unique not null
  reason: enum('hard_bounce', 'unsubscribe', 'spam_complaint', 'manual')
  campaignId: uuid (reference to campaigns)
  addedAt: timestamp
  metadata: jsonb
}
```

**Index**: On `email` for fast lookups during campaign sends

#### B. Webhook Integration for Auto-Suppression
**Location**: `server/routes.ts` - Mailgun webhook

**Logic**:
1. On `hard_bounce` event:
   - Add email to suppression list with reason='hard_bounce'
   - Update contact record: `emailStatus = 'bounced'`
   
2. On `unsubscribed` event:
   - Add email to suppression list with reason='unsubscribe'
   - Update contact record: `unsubscribed = true`, `unsubscribedAt = now()`
   
3. On `complained` event:
   - Add email to suppression list with reason='spam_complaint'
   - Update contact record: `spamComplaint = true`

#### C. Pre-Send Suppression Check
**Location**: `server/services/bulk-email-service.ts`

**Implementation**:
1. Before sending any email, check suppression list
2. Filter out suppressed emails from campaign audience
3. Log suppression reasons for reporting

## 3. Enhanced Audience Filtering 🎯

### Current State
- Filter builder exists (`FilterBuilder` component)
- Campaigns can select lists OR filters (not both)
- No ability to filter within a list

### Required Implementation

#### A. List + Filter Combination
**Location**: `client/src/components/campaign-builder/step1-audience-selection.tsx`

**Changes**:
1. Allow selecting a list THEN applying filters
2. Pass `audienceScope: { listIds: [selectedListId] }` to FilterBuilder
3. Backend applies filters only to contacts in specified list

#### B. Backend Filter Scoping
**Location**: `server/routes.ts` - Filter count endpoint

**Logic**:
```typescript
// If audienceScope.listIds provided:
// 1. Get contact IDs from lists
// 2. Apply filter conditions within those contact IDs only
// 3. Return scoped count
```

## 4. Campaign Type Routing Fix 🔧

### Current State
- `/campaigns/email` page shows all campaigns
- No filtering by campaign type in query

### Required Fix

#### A. Email Campaigns Page
**Location**: `client/src/pages/email-campaigns.tsx`

**Change**: Add type filter to query
```typescript
const { data: campaigns } = useQuery({
  queryKey: ['/api/campaigns', { type: 'email' }],
  queryFn: async () => {
    const res = await apiRequest('GET', '/api/campaigns?type=email');
    return res.json();
  }
});
```

#### B. Backend Endpoint Enhancement
**Location**: `server/routes.ts` - GET /api/campaigns

**Add query parameter support**:
```typescript
app.get("/api/campaigns", async (req, res) => {
  const { type } = req.query;
  let query = db.select().from(campaigns);
  
  if (type) {
    query = query.where(eq(campaigns.type, type));
  }
  
  const results = await query;
  res.json(results);
});
```

## 5. UI Enhancements for Reporting

### A. Campaign List View Enhancements
**Location**: `client/src/pages/email-campaigns.tsx`

**Add Per-Campaign Metrics Display**:
```tsx
<div className="campaign-metrics">
  <span>Sent: {campaign.metrics?.sent || 0}</span>
  <span>Opens: {campaign.metrics?.opened || 0} ({openRate}%)</span>
  <span>Clicks: {campaign.metrics?.clicked || 0} ({clickRate}%)</span>
  <span>Bounces: {campaign.metrics?.bounced || 0}</span>
</div>
```

### B. Campaign Detail View
**Location**: Create `client/src/pages/email-campaign-view.tsx`

**Components**:
1. Summary Cards (Sent, Delivered, Opens, Clicks, Bounces)
2. Performance Charts (Time-series)
3. Engagement Funnel Visualization
4. Contact-Level Activity Log
5. Geographic/Device Breakdown

## Implementation Order

1. **Phase 1: Database & Webhook Integration** (High Priority)
   - Complete Mailgun webhook event storage
   - Add email_suppression_list table
   - Implement auto-suppression logic

2. **Phase 2: Reporting Endpoints** (High Priority)
   - Campaign metrics endpoint
   - Event log endpoint
   - Suppression status checks

3. **Phase 3: UI Updates** (Medium Priority)
   - Email campaigns filtering by type
   - Campaign metrics display in list view
   - Detailed reporting page

4. **Phase 4: Audience Filtering** (Medium Priority)
   - List + filter combination support
   - Backend scoping logic
   - UI integration

5. **Phase 5: Testing & Validation** (Critical)
   - Test suppression logic with sample bounces
   - Verify campaign reporting accuracy
   - Test audience filter combinations
   - Validate UI routing

## Database Schema Additions Required

```sql
-- Email suppression list (global)
CREATE TABLE email_suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) UNIQUE NOT NULL,
  reason VARCHAR(50) NOT NULL CHECK (reason IN ('hard_bounce', 'unsubscribe', 'spam_complaint', 'manual')),
  campaign_id UUID REFERENCES campaigns(id),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_email_suppression_email ON email_suppression_list(email);
CREATE INDEX idx_email_suppression_reason ON email_suppression_list(reason);

-- Add indexes to email_events for faster queries
CREATE INDEX idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX idx_email_events_contact ON email_events(contact_id);
CREATE INDEX idx_email_events_type ON email_events(type);
CREATE INDEX idx_email_events_created ON email_events(created_at DESC);
```

## Testing Checklist

### Suppression System
- [ ] Hard bounce adds email to suppression list
- [ ] Unsubscribe adds email to suppression list
- [ ] Suppressed emails excluded from future campaigns
- [ ] Contact records updated correctly
- [ ] Manual suppression works via UI

### Campaign Reporting
- [ ] All metrics calculated correctly
- [ ] Real-time updates from webhooks
- [ ] Contact-level events tracked
- [ ] Charts display accurate data
- [ ] Export functionality works

### Audience Filtering
- [ ] Can select list + apply filters
- [ ] Filter count accurate within list scope
- [ ] Campaign sends to correct filtered audience
- [ ] Exclusions work correctly

### UI Routing
- [ ] /campaigns/email shows only email campaigns
- [ ] /campaigns/telemarketing shows only call campaigns
- [ ] Metrics displayed on campaign cards
- [ ] Navigation between views works

---

## Ready to Implement?

This plan covers all the requirements you specified:
- ✅ Comprehensive email campaign reporting
- ✅ Contact-level event tracking
- ✅ Automatic suppression for unsubscribes and hard bounces
- ✅ List + filter audience refinement
- ✅ Correct campaign type routing

Please confirm if you'd like me to proceed with implementation, or if you have any adjustments to the plan.
