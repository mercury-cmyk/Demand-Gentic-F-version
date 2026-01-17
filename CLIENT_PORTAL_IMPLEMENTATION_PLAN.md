# Client Portal Enhancement - Implementation Plan

## Executive Summary

This document outlines the implementation plan for enhancing the existing client portal with:
1. **Project & Campaign Management** - Clients can create projects, campaigns, and orders
2. **Campaign Reports** - Real-time delivery tracking with link visibility
3. **Real-Time Cost Tracking** - Live cost visibility for all activities
4. **Auto Invoice Generation** - Monthly automated invoicing based on usage
5. **Agentic Voice Features** - Voice-controlled dashboard navigation and actions

---

## Current State Analysis

### Existing Infrastructure (Already Built)

| Component | Status | Location |
|-----------|--------|----------|
| Client Accounts | ✅ Built | `clientAccounts` table |
| Client Users | ✅ Built | `clientUsers` table |
| Client Auth (JWT) | ✅ Built | `server/routes/client-portal.ts` |
| Campaign Access | ✅ Built | `clientCampaignAccess` table |
| Order Management | ✅ Built | `clientPortalOrders`, `clientPortalOrderContacts` |
| Client Dashboard UI | ✅ Basic | `client/src/pages/client-portal-dashboard.tsx` |
| Client Login UI | ✅ Built | `client/src/pages/client-portal-login.tsx` |
| Admin Management | ✅ Built | `client/src/pages/client-portal-admin.tsx` |

### Missing Components (To Be Built)

| Component | Priority | Complexity |
|-----------|----------|------------|
| Projects System | High | Medium |
| Enhanced Campaign Reports | High | Medium |
| Real-time Cost Tracking | High | High |
| Invoice Generation | High | High |
| Billing & Pricing Config | High | Medium |
| Voice Command Interface | Medium | High |
| Voice-triggered Actions | Medium | High |
| Dashboard Analytics | Medium | Medium |

---

## Database Schema Extensions

### 1. Client Projects Table

```sql
-- Projects contain multiple campaigns and serve as billing containers
CREATE TABLE client_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,

  -- Project Details
  name TEXT NOT NULL,
  description TEXT,
  project_code TEXT UNIQUE, -- e.g., "PRJ-2025-001"

  -- Dates
  start_date DATE,
  end_date DATE,

  -- Status
  status TEXT DEFAULT 'active', -- draft, active, paused, completed, archived

  -- Budget
  budget_amount NUMERIC(12,2),
  budget_currency TEXT DEFAULT 'USD',

  -- Billing Settings (can override account defaults)
  billing_model TEXT DEFAULT 'cpl', -- cpl, cpc, monthly_retainer, hybrid
  rate_per_lead NUMERIC(10,2),
  rate_per_contact NUMERIC(10,2),
  monthly_retainer NUMERIC(10,2),

  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Link campaigns to projects
CREATE TABLE client_project_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES client_projects(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES verification_campaigns(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),

  UNIQUE(project_id, campaign_id)
);
```

### 2. Billing & Pricing Tables

```sql
-- Client billing configuration (account-level defaults)
CREATE TABLE client_billing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL UNIQUE REFERENCES client_accounts(id) ON DELETE CASCADE,

  -- Pricing Model
  default_billing_model TEXT DEFAULT 'cpl', -- cpl, cpc, monthly_retainer, hybrid

  -- Rates (defaults, can be overridden per project)
  default_rate_per_lead NUMERIC(10,2) DEFAULT 150.00, -- Price per qualified lead
  default_rate_per_contact NUMERIC(10,2) DEFAULT 25.00, -- Price per verified contact
  default_rate_per_call_minute NUMERIC(10,4) DEFAULT 0.15, -- AI call costs
  default_rate_per_email NUMERIC(10,4) DEFAULT 0.02, -- Email send costs

  -- Retainer Settings
  monthly_retainer_amount NUMERIC(12,2),
  retainer_includes_leads INTEGER, -- Number of leads included in retainer
  overage_rate_per_lead NUMERIC(10,2), -- Rate for leads over retainer cap

  -- Payment Terms
  payment_terms_days INTEGER DEFAULT 30, -- NET 30, NET 15, etc.
  currency TEXT DEFAULT 'USD',

  -- Billing Contact
  billing_email TEXT,
  billing_address JSONB,

  -- Tax
  tax_exempt BOOLEAN DEFAULT FALSE,
  tax_id TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Activity-based cost tracking (real-time)
CREATE TABLE client_activity_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id),
  project_id UUID REFERENCES client_projects(id),
  campaign_id UUID REFERENCES verification_campaigns(id),
  order_id UUID REFERENCES client_portal_orders(id),

  -- Activity Details
  activity_type TEXT NOT NULL, -- lead_delivered, contact_verified, ai_call, email_sent, etc.
  activity_date TIMESTAMP DEFAULT NOW(),

  -- Reference to source record
  reference_type TEXT, -- lead, contact, call, email
  reference_id UUID,

  -- Cost Calculation
  quantity INTEGER DEFAULT 1,
  unit_rate NUMERIC(10,4) NOT NULL,
  total_cost NUMERIC(12,4) NOT NULL,
  currency TEXT DEFAULT 'USD',

  -- Billing Status
  invoice_id UUID REFERENCES client_invoices(id),
  invoiced_at TIMESTAMP,

  -- Metadata
  description TEXT,
  metadata JSONB, -- Additional context (call duration, etc.)

  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient billing queries
CREATE INDEX idx_activity_costs_client_date ON client_activity_costs(client_account_id, activity_date);
CREATE INDEX idx_activity_costs_invoice ON client_activity_costs(invoice_id);
CREATE INDEX idx_activity_costs_uninvoiced ON client_activity_costs(client_account_id) WHERE invoice_id IS NULL;
```

### 3. Invoice Tables

```sql
CREATE TYPE invoice_status AS ENUM ('draft', 'pending', 'sent', 'paid', 'overdue', 'void', 'disputed');

CREATE TABLE client_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id),

  -- Invoice Details
  invoice_number TEXT UNIQUE NOT NULL, -- INV-2025-001

  -- Period
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,

  -- Amounts
  subtotal NUMERIC(12,2) NOT NULL,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',

  -- Status
  status invoice_status DEFAULT 'draft',

  -- Dates
  issue_date DATE,
  due_date DATE,
  paid_date DATE,

  -- Payment
  payment_method TEXT, -- bank_transfer, card, check
  payment_reference TEXT, -- Transaction ID

  -- Notes
  notes TEXT,
  internal_notes TEXT,

  -- PDF Storage
  pdf_url TEXT, -- S3/GCS URL to generated PDF

  -- Audit
  created_by UUID REFERENCES users(id),
  sent_by UUID REFERENCES users(id),
  sent_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Invoice line items (detailed breakdown)
CREATE TABLE client_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES client_invoices(id) ON DELETE CASCADE,

  -- Item Details
  description TEXT NOT NULL,
  item_type TEXT NOT NULL, -- leads, contacts, ai_calls, emails, retainer, adjustment

  -- Quantity & Pricing
  quantity NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(10,4) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,

  -- Project/Campaign Reference
  project_id UUID REFERENCES client_projects(id),
  campaign_id UUID REFERENCES verification_campaigns(id),

  -- Period covered (for line item)
  period_start DATE,
  period_end DATE,

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Invoice activity log
CREATE TABLE client_invoice_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES client_invoices(id) ON DELETE CASCADE,

  activity_type TEXT NOT NULL, -- created, sent, viewed, payment_received, reminder_sent, disputed
  description TEXT,

  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMP DEFAULT NOW()
);
```

### 4. Delivery Tracking Tables

```sql
-- Link deliveries for campaign reports
CREATE TABLE client_delivery_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id),
  order_id UUID REFERENCES client_portal_orders(id),
  campaign_id UUID REFERENCES verification_campaigns(id),

  -- Delivery Details
  delivery_type TEXT NOT NULL, -- csv_export, api_push, sftp, email
  delivery_status TEXT DEFAULT 'pending', -- pending, processing, delivered, failed

  -- Link Information
  file_url TEXT, -- S3/GCS URL for downloadable file
  link_expires_at TIMESTAMP,
  download_count INTEGER DEFAULT 0,
  max_downloads INTEGER, -- Optional limit

  -- Delivery Content
  contact_count INTEGER NOT NULL,
  file_format TEXT, -- csv, xlsx, json
  file_size_bytes BIGINT,

  -- Tracking
  delivered_at TIMESTAMP,
  first_accessed_at TIMESTAMP,
  last_accessed_at TIMESTAMP,

  -- Security
  access_token TEXT UNIQUE, -- Token for secure download link
  password_protected BOOLEAN DEFAULT FALSE,
  password_hash TEXT,

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Download access log
CREATE TABLE client_delivery_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_link_id UUID NOT NULL REFERENCES client_delivery_links(id),

  accessed_at TIMESTAMP DEFAULT NOW(),
  accessed_by_user_id UUID REFERENCES client_users(id),
  ip_address TEXT,
  user_agent TEXT
);
```

### 5. Voice Command Tables

```sql
-- Voice command history for clients
CREATE TABLE client_voice_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id UUID NOT NULL REFERENCES client_users(id),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id),

  -- Command Details
  transcript TEXT NOT NULL, -- What the user said
  intent TEXT, -- Parsed intent (navigate, query, action)
  entities JSONB, -- Extracted entities (project names, dates, etc.)

  -- Response
  response_text TEXT, -- AI response
  response_audio_url TEXT, -- TTS audio URL

  -- Action Taken
  action_type TEXT, -- navigation, data_query, create_order, etc.
  action_result JSONB, -- Result of the action
  action_success BOOLEAN,

  -- Timing
  processing_duration_ms INTEGER,

  -- Audio Storage
  audio_input_url TEXT, -- S3 URL to original audio

  created_at TIMESTAMP DEFAULT NOW()
);

-- Voice agent configuration per client
CREATE TABLE client_voice_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID UNIQUE NOT NULL REFERENCES client_accounts(id),

  -- Voice Settings
  voice_enabled BOOLEAN DEFAULT TRUE,
  preferred_voice TEXT DEFAULT 'nova', -- OpenAI voice
  response_speed NUMERIC(3,2) DEFAULT 1.0, -- 0.5 to 2.0

  -- Permissions
  voice_can_create_orders BOOLEAN DEFAULT TRUE,
  voice_can_view_invoices BOOLEAN DEFAULT TRUE,
  voice_can_download_reports BOOLEAN DEFAULT TRUE,

  -- Custom Vocabulary
  custom_vocabulary JSONB, -- Project names, industry terms

  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Routes Structure

### New Client Portal Routes

```
/api/client-portal/
├── auth/
│   ├── POST login              ✅ Exists
│   ├── GET  me                 ✅ Exists
│   └── POST change-password    🆕 New
│
├── projects/
│   ├── GET    /                🆕 List all projects
│   ├── POST   /                🆕 Create project
│   ├── GET    /:id             🆕 Get project details
│   ├── PUT    /:id             🆕 Update project
│   ├── GET    /:id/campaigns   🆕 Get project campaigns
│   └── GET    /:id/costs       🆕 Get project costs
│
├── campaigns/
│   ├── GET    /                ✅ Exists
│   ├── GET    /:id             🆕 Get campaign details
│   ├── GET    /:id/report      🆕 Get campaign report
│   └── GET    /:id/deliveries  🆕 Get delivery links
│
├── orders/
│   ├── GET    /                ✅ Exists
│   ├── POST   /                ✅ Exists
│   ├── GET    /:id             ✅ Exists
│   └── GET    /:id/contacts    🆕 Get order contacts
│
├── costs/
│   ├── GET    /summary         🆕 Get cost summary
│   ├── GET    /realtime        🆕 WebSocket for live costs
│   ├── GET    /by-project      🆕 Costs grouped by project
│   └── GET    /by-campaign     🆕 Costs grouped by campaign
│
├── invoices/
│   ├── GET    /                🆕 List invoices
│   ├── GET    /:id             🆕 Get invoice details
│   ├── GET    /:id/pdf         🆕 Download invoice PDF
│   └── GET    /:id/items       🆕 Get invoice line items
│
├── deliveries/
│   ├── GET    /                🆕 List all deliveries
│   ├── GET    /:id/download    🆕 Download delivery file
│   └── GET    /:token          🆕 Public download by token
│
└── voice/
    ├── POST   /command         🆕 Process voice command
    ├── POST   /transcribe      🆕 Transcribe audio
    ├── GET    /history         🆕 Command history
    └── PUT    /config          🆕 Update voice settings
```

---

## Frontend Components Structure

```
client/src/pages/
├── client-portal/
│   ├── layout.tsx              🆕 Shared layout with sidebar
│   ├── dashboard.tsx           🔄 Enhanced (existing base)
│   ├── projects/
│   │   ├── index.tsx           🆕 Projects list
│   │   ├── [id].tsx            🆕 Project detail
│   │   └── new.tsx             🆕 Create project form
│   ├── campaigns/
│   │   ├── index.tsx           🔄 Enhanced campaign list
│   │   └── [id]/
│   │       ├── index.tsx       🆕 Campaign detail
│   │       ├── report.tsx      🆕 Campaign report
│   │       └── deliveries.tsx  🆕 Delivery links
│   ├── orders/
│   │   ├── index.tsx           🔄 Enhanced order list
│   │   └── [id].tsx            🔄 Enhanced order detail
│   ├── billing/
│   │   ├── index.tsx           🆕 Billing overview
│   │   ├── costs.tsx           🆕 Real-time costs
│   │   └── invoices/
│   │       ├── index.tsx       🆕 Invoice list
│   │       └── [id].tsx        🆕 Invoice detail
│   └── settings/
│       ├── index.tsx           🆕 Account settings
│       └── voice.tsx           🆕 Voice settings

client/src/components/client-portal/
├── layout/
│   ├── sidebar.tsx             🆕 Navigation sidebar
│   ├── header.tsx              🆕 Top header with voice
│   └── voice-button.tsx        🆕 Voice activation button
├── dashboard/
│   ├── stats-cards.tsx         🆕 KPI cards
│   ├── recent-activity.tsx     🆕 Activity timeline
│   ├── cost-chart.tsx          🆕 Cost visualization
│   └── quick-actions.tsx       🆕 Voice-enabled actions
├── projects/
│   ├── project-card.tsx        🆕 Project card
│   └── project-form.tsx        🆕 Create/edit form
├── campaigns/
│   ├── campaign-report.tsx     🆕 Report visualization
│   ├── delivery-table.tsx      🆕 Deliveries list
│   └── contact-preview.tsx     🆕 Contact preview
├── billing/
│   ├── cost-summary.tsx        🆕 Cost summary card
│   ├── cost-breakdown.tsx      🆕 Detailed breakdown
│   ├── invoice-card.tsx        🆕 Invoice card
│   └── invoice-pdf-viewer.tsx  🆕 PDF preview
└── voice/
    ├── voice-assistant.tsx     🆕 Voice modal/overlay
    ├── voice-visualizer.tsx    🆕 Audio waveform
    ├── voice-commands-list.tsx 🆕 Available commands
    └── voice-history.tsx       🆕 Recent commands
```

---

## Agentic Voice Features Design

### Voice Command Categories

| Category | Example Commands | Action |
|----------|-----------------|--------|
| **Navigation** | "Go to my projects" | Navigate to /projects |
| | "Show campaign reports" | Navigate to /campaigns |
| | "Open billing" | Navigate to /billing |
| **Queries** | "What's my total spend this month?" | Display cost summary |
| | "How many leads delivered this week?" | Show lead count |
| | "Show pending invoices" | List unpaid invoices |
| **Actions** | "Create a new order for 500 leads" | Open order form |
| | "Download the latest report" | Trigger download |
| | "Request a callback" | Create support ticket |
| **Reports** | "Summarize campaign performance" | Generate AI summary |
| | "Compare costs to last month" | Show comparison chart |

### Voice Assistant Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Client Dashboard                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Voice Activation Button                  │  │
│  │                  🎤 "Hi, how can I help?"                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Browser Web Speech API                       │  │
│  │         (or OpenAI Whisper for better accuracy)          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 POST /api/client-portal/voice/command     │  │
│  │                                                           │  │
│  │  Request: { transcript: "What's my spend this month?" }  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               OpenAI GPT-4 Intent Parser                  │  │
│  │                                                           │  │
│  │  System: "Parse client portal commands. Extract:         │  │
│  │   - intent: navigation | query | action | report          │  │
│  │   - entities: dates, amounts, project names"              │  │
│  │                                                           │  │
│  │  Output: { intent: "query", action: "get_monthly_spend" } │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Action Executor                         │  │
│  │                                                           │  │
│  │  - Execute database queries                               │  │
│  │  - Generate responses                                     │  │
│  │  - Return navigation commands                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               OpenAI TTS Response                         │  │
│  │                                                           │  │
│  │  "Your total spend this month is $4,250.                 │  │
│  │   That's up 12% from last month."                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Client Dashboard                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                Audio Response Playback                    │  │
│  │         + Visual Update (cost card highlights)            │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Voice Command Processing Flow

```typescript
// Voice command handler
interface VoiceCommandResult {
  intent: 'navigation' | 'query' | 'action' | 'report';
  action: string;
  parameters: Record<string, unknown>;
  response: {
    text: string;
    audioUrl?: string;
  };
  navigation?: {
    path: string;
    params?: Record<string, string>;
  };
  data?: unknown; // Query results to display
}

// Example implementation
async function processVoiceCommand(
  clientAccountId: string,
  transcript: string
): Promise<VoiceCommandResult> {
  // 1. Parse intent using GPT-4
  const parsed = await parseIntent(transcript, {
    clientContext: await getClientContext(clientAccountId),
    availableActions: VOICE_ACTIONS,
  });

  // 2. Execute action
  const result = await executeVoiceAction(parsed, clientAccountId);

  // 3. Generate response
  const response = await generateVoiceResponse(result);

  // 4. Store command history
  await storeVoiceCommand(clientAccountId, transcript, parsed, result);

  return {
    intent: parsed.intent,
    action: parsed.action,
    parameters: parsed.parameters,
    response,
    navigation: result.navigation,
    data: result.data,
  };
}
```

---

## Auto Invoice Generation System

### Invoice Generation Flow

```
                    Monthly Cron Job (1st of month at 00:00 UTC)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                   For Each Active Client                         │
│                                                                  │
│  1. Calculate billing period (previous month)                   │
│  2. Aggregate all uninvoiced activity_costs                     │
│  3. Apply billing model (CPL, retainer, hybrid)                 │
│  4. Calculate taxes if applicable                               │
│  5. Generate invoice record                                     │
│  6. Create line items with breakdown                            │
│  7. Generate PDF using template                                 │
│  8. Upload PDF to GCS/S3                                        │
│  9. Mark activity_costs as invoiced                             │
│  10. Send invoice email notification                            │
└─────────────────────────────────────────────────────────────────┘
```

### Invoice Generation Service

```typescript
// services/invoice-generator.ts
async function generateMonthlyInvoices() {
  const billingPeriod = getPreviousMonthPeriod();

  // Get all active clients with billing config
  const clients = await db.select()
    .from(clientAccounts)
    .innerJoin(clientBillingConfig, eq(clientBillingConfig.clientAccountId, clientAccounts.id))
    .where(eq(clientAccounts.isActive, true));

  for (const client of clients) {
    await generateClientInvoice(client, billingPeriod);
  }
}

async function generateClientInvoice(
  client: ClientWithBillingConfig,
  period: { start: Date; end: Date }
) {
  // 1. Get uninvoiced costs
  const costs = await db.select()
    .from(clientActivityCosts)
    .where(and(
      eq(clientActivityCosts.clientAccountId, client.id),
      isNull(clientActivityCosts.invoiceId),
      between(clientActivityCosts.activityDate, period.start, period.end)
    ));

  if (costs.length === 0) return; // No billable activity

  // 2. Aggregate by type
  const lineItems = aggregateCostsByType(costs, client.billingConfig);

  // 3. Calculate totals
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const tax = client.billingConfig.taxExempt ? 0 : subtotal * 0.0; // Tax rate
  const total = subtotal + tax;

  // 4. Create invoice
  const invoice = await db.insert(clientInvoices).values({
    clientAccountId: client.id,
    invoiceNumber: generateInvoiceNumber(),
    billingPeriodStart: period.start,
    billingPeriodEnd: period.end,
    subtotal,
    taxAmount: tax,
    totalAmount: total,
    currency: client.billingConfig.currency,
    status: 'draft',
    issueDate: new Date(),
    dueDate: addDays(new Date(), client.billingConfig.paymentTermsDays),
  }).returning();

  // 5. Create line items
  await db.insert(clientInvoiceItems).values(
    lineItems.map((item, idx) => ({
      invoiceId: invoice[0].id,
      description: item.description,
      itemType: item.type,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      periodStart: period.start,
      periodEnd: period.end,
      sortOrder: idx,
    }))
  );

  // 6. Update costs with invoice reference
  await db.update(clientActivityCosts)
    .set({ invoiceId: invoice[0].id, invoicedAt: new Date() })
    .where(inArray(clientActivityCosts.id, costs.map(c => c.id)));

  // 7. Generate PDF
  const pdfUrl = await generateInvoicePDF(invoice[0], lineItems, client);
  await db.update(clientInvoices)
    .set({ pdfUrl })
    .where(eq(clientInvoices.id, invoice[0].id));

  // 8. Send notification
  await sendInvoiceNotification(client, invoice[0], pdfUrl);
}
```

---

## Real-Time Cost Tracking

### WebSocket Implementation

```typescript
// Real-time cost updates via WebSocket
// server/services/cost-tracker-realtime.ts

const clientCostSubscriptions = new Map<string, Set<WebSocket>>();

export function subscribeToCostUpdates(clientAccountId: string, ws: WebSocket) {
  if (!clientCostSubscriptions.has(clientAccountId)) {
    clientCostSubscriptions.set(clientAccountId, new Set());
  }
  clientCostSubscriptions.get(clientAccountId)!.add(ws);
}

export function broadcastCostUpdate(clientAccountId: string, costEvent: CostEvent) {
  const subscribers = clientCostSubscriptions.get(clientAccountId);
  if (!subscribers) return;

  const message = JSON.stringify({
    type: 'cost_update',
    data: costEvent,
  });

  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

// Called when any billable activity occurs
export async function recordActivityCost(params: {
  clientAccountId: string;
  projectId?: string;
  campaignId?: string;
  activityType: ActivityType;
  referenceId?: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
}) {
  // Get client billing config
  const config = await getClientBillingConfig(params.clientAccountId);
  const unitRate = getUnitRate(config, params.activityType);
  const quantity = params.quantity || 1;
  const totalCost = unitRate * quantity;

  // Insert cost record
  const cost = await db.insert(clientActivityCosts).values({
    clientAccountId: params.clientAccountId,
    projectId: params.projectId,
    campaignId: params.campaignId,
    activityType: params.activityType,
    referenceType: getRefType(params.activityType),
    referenceId: params.referenceId,
    quantity,
    unitRate,
    totalCost,
    metadata: params.metadata,
  }).returning();

  // Broadcast to connected clients
  broadcastCostUpdate(params.clientAccountId, {
    id: cost[0].id,
    type: params.activityType,
    amount: totalCost,
    timestamp: new Date(),
  });

  return cost[0];
}
```

---

## Implementation Phases

### Phase 1: Database & Core API (Week 1-2)
- [ ] Add new database tables (migrations)
- [ ] Implement project CRUD APIs
- [ ] Implement billing config APIs
- [ ] Implement cost tracking service
- [ ] Add invoice generation service

### Phase 2: Enhanced Dashboard UI (Week 2-3)
- [ ] Create new client portal layout with sidebar
- [ ] Build projects management pages
- [ ] Build enhanced campaign reports
- [ ] Build delivery links management
- [ ] Build real-time cost dashboard

### Phase 3: Billing & Invoicing (Week 3-4)
- [ ] Build invoice management pages
- [ ] Implement PDF generation
- [ ] Create billing overview dashboard
- [ ] Set up monthly cron job
- [ ] Build invoice email templates

### Phase 4: Voice Features (Week 4-5)
- [ ] Implement voice command API
- [ ] Build voice assistant UI component
- [ ] Create intent parser with GPT-4
- [ ] Implement action executors
- [ ] Add voice settings page
- [ ] Test all voice commands

### Phase 5: Testing & Polish (Week 5-6)
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Security audit
- [ ] Documentation
- [ ] Client onboarding flow

---

## Security Considerations

1. **Authentication**: Separate JWT tokens for clients vs admin users
2. **Authorization**: Clients can only access their own data
3. **Rate Limiting**: Voice commands limited to 60/hour
4. **Audit Trail**: All actions logged in activity tables
5. **Secure Downloads**: Time-limited signed URLs for file downloads
6. **Input Validation**: Zod schemas for all inputs
7. **SQL Injection**: Drizzle ORM with parameterized queries

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Client portal adoption | 80% of clients active within 30 days |
| Voice command success rate | > 90% understood correctly |
| Invoice generation accuracy | 100% (no manual corrections needed) |
| Page load time | < 2 seconds |
| Real-time cost latency | < 500ms |

---

## Next Steps

1. Review and approve this plan
2. Create database migrations
3. Begin implementation of Phase 1
4. Set up development environment for voice testing
