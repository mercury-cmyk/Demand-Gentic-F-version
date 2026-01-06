# Phase 5: Advanced Features Implementation

## ✨ Advanced Features Overview

### 1. A/B Testing
### 2. Conditional Personalization  
### 3. Campaign Analytics Dashboard
### 4. Webhook Events System
### 5. ESP Integrations

---

## 🔬 Feature 1: A/B Testing

### Overview
Split audience to test two email variations and track performance differences.

### Data Model
```typescript
interface ABTest {
  id: string;
  campaignId: string;
  variantA: {
    subject: string;
    htmlContent: string;
    splitPercentage: number; // 0-100
  };
  variantB: {
    subject: string;
    htmlContent: string;
    splitPercentage: number; // 0-100
  };
  metrics: {
    variantA: {
      sent: number;
      opened: number;
      clicked: number;
      bounced: number;
    };
    variantB: {
      sent: number;
      opened: number;
      clicked: number;
      bounced: number;
    };
  };
  winnerDetermined: boolean;
  winnerVariant?: 'A' | 'B';
  statisticalSignificance: number; // 0-1
  createdAt: Date;
  completedAt?: Date;
}
```

### API Endpoints
```typescript
// Create A/B test
POST /api/campaigns/:id/ab-tests
{
  variantA: { subject, htmlContent },
  variantB: { subject, htmlContent },
  splitPercentage: 50,
  testDuration: 24, // hours
  minimumSampleSize: 1000
}

// Get A/B test results
GET /api/campaigns/:id/ab-tests/:testId

// Declare winner
POST /api/campaigns/:id/ab-tests/:testId/declare-winner
{
  winnerVariant: 'A'
}
```

### Implementation
```typescript
// Split audience for A/B test
async function splitForABTest(
  campaignId: string,
  abTestId: string,
  contacts: Contact[],
  splitPercentage: number
) {
  const splitPoint = Math.floor(contacts.length * splitPercentage / 100);
  
  const variantA = contacts.slice(0, splitPoint);
  const variantB = contacts.slice(splitPoint);
  
  // Queue emails with variant tracking
  await Promise.all([
    ...variantA.map(contact =>
      queueEmail(campaignId, contact, 'A', abTestId)
    ),
    ...variantB.map(contact =>
      queueEmail(campaignId, contact, 'B', abTestId)
    )
  ]);
}

// Track metrics
function trackABTestMetric(
  testId: string,
  variant: 'A' | 'B',
  metric: 'open' | 'click' | 'bounce'
) {
  incrementCounter(`ab_test.${testId}.${variant}.${metric}`);
  
  // Calculate real-time statistics
  calculateSignificance(testId);
}

// Calculate statistical significance
function calculateSignificance(testId: string): number {
  const metricsA = getMetrics(testId, 'A');
  const metricsB = getMetrics(testId, 'B');
  
  // Chi-square test
  const observed = [
    metricsA.opened,
    metricsB.opened,
    metricsA.sent - metricsA.opened,
    metricsB.sent - metricsB.opened
  ];
  
  const expected = calculateExpected(observed);
  const chiSquare = calculateChiSquare(observed, expected);
  const pValue = getPValue(chiSquare, 1); // 1 degree of freedom
  
  return 1 - pValue;
}
```

---

## 🎯 Feature 2: Conditional Personalization

### Overview
Show different content based on contact attributes or behavior.

### Syntax
```
{{if company == 'Acme'}}
  Welcome to Acme Corp!
{{else if company == 'TechInc'}}
  Welcome to Tech Inc!
{{else}}
  Welcome!
{{endif}}
```

### Data Model
```typescript
interface ConditionalBlock {
  id: string;
  type: 'text' | 'image' | 'button';
  conditions: Condition[];
  content: {
    if: BlockContent;
    elseif?: Array<{ condition: Condition; content: BlockContent }>;
    else?: BlockContent;
  };
}

interface Condition {
  field: string; // contact attribute
  operator: '==' | '!=' | '>' | '<' | 'contains' | 'startsWith';
  value: string | number;
}
```

### API Endpoint
```typescript
POST /api/campaigns/:id/conditional-blocks
{
  conditions: [
    {
      field: 'company',
      operator: '==',
      value: 'Acme'
    }
  ],
  content: {
    if: { type: 'text', text: 'Welcome Acme!' },
    else: { type: 'text', text: 'Welcome!' }
  }
}
```

### Implementation
```typescript
function renderConditionalBlock(
  block: ConditionalBlock,
  contact: Contact
): string {
  // Evaluate conditions
  for (const condition of block.conditions) {
    if (evaluateCondition(condition, contact)) {
      return renderContent(block.content.if);
    }
  }
  
  // Check else-if conditions
  if (block.content.elseif) {
    for (const elseif of block.content.elseif) {
      if (evaluateCondition(elseif.condition, contact)) {
        return renderContent(elseif.content);
      }
    }
  }
  
  // Default to else
  return block.content.else 
    ? renderContent(block.content.else)
    : '';
}

function evaluateCondition(condition: Condition, contact: Contact): boolean {
  const value = getNestedValue(contact, condition.field);
  
  switch (condition.operator) {
    case '==':
      return value === condition.value;
    case '!=':
      return value !== condition.value;
    case '>':
      return value > condition.value;
    case '<':
      return value < condition.value;
    case 'contains':
      return String(value).includes(String(condition.value));
    case 'startsWith':
      return String(value).startsWith(String(condition.value));
    default:
      return false;
  }
}
```

---

## 📊 Feature 3: Campaign Analytics Dashboard

### Overview
Real-time metrics and insights about campaign performance.

### Metrics Tracked
```typescript
interface CampaignMetrics {
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  openCount: number;
  openRate: number; // percentage
  clickCount: number;
  clickRate: number; // percentage
  bounceCount: number;
  bounceRate: number; // percentage
  unsubscribeCount: number;
  unsubscribeRate: number; // percentage
  conversionCount?: number;
  conversionRate?: number; // percentage
  revenue?: number;
}
```

### API Endpoints
```typescript
// Get campaign metrics
GET /api/campaigns/:id/metrics

// Response
{
  sentCount: 10000,
  deliveredCount: 9850,
  failedCount: 150,
  openCount: 3450,
  openRate: 34.5,
  clickCount: 892,
  clickRate: 8.92,
  bounceCount: 150,
  bounceRate: 1.5,
  unsubscribeCount: 45,
  unsubscribeRate: 0.45
}

// Get daily metrics
GET /api/campaigns/:id/metrics/daily?days=30

// Get link performance
GET /api/campaigns/:id/links
{
  "https://example.com/promo": {
    clicks: 250,
    uniqueClicks: 180
  }
}
```

### Dashboard UI Component
```typescript
// Analytics Dashboard Component
export function AnalyticsDashboard({ campaignId }: { campaignId: string }) {
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [chartData, setChartData] = useState<any>(null);
  
  useEffect(() => {
    fetchMetrics(campaignId).then(setMetrics);
    fetchDailyMetrics(campaignId).then(setChartData);
  }, [campaignId]);
  
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          title="Sent"
          value={metrics?.sentCount}
          icon="send"
        />
        <MetricCard
          title="Open Rate"
          value={`${metrics?.openRate.toFixed(2)}%`}
          icon="envelope-open"
        />
        <MetricCard
          title="Click Rate"
          value={`${metrics?.clickRate.toFixed(2)}%`}
          icon="mouse-pointer"
        />
        <MetricCard
          title="Bounce Rate"
          value={`${metrics?.bounceRate.toFixed(2)}%`}
          icon="alert-circle"
        />
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <LineChart
          title="Engagement Over Time"
          data={chartData?.daily}
          metrics={['open', 'click']}
        />
        <BarChart
          title="Performance Breakdown"
          data={chartData?.breakdown}
        />
      </div>
      
      {/* Top Links */}
      <TopLinksTable campaignId={campaignId} />
    </div>
  );
}
```

---

## 🔔 Feature 4: Webhook Events System

### Overview
Real-time notifications for email events (sent, opened, clicked, bounced).

### Event Types
```typescript
enum WebhookEventType {
  EMAIL_SENT = 'email.sent',
  EMAIL_DELIVERED = 'email.delivered',
  EMAIL_OPENED = 'email.opened',
  EMAIL_CLICKED = 'email.clicked',
  EMAIL_BOUNCED = 'email.bounced',
  EMAIL_UNSUBSCRIBED = 'email.unsubscribed',
  CAMPAIGN_SENT = 'campaign.sent',
  CAMPAIGN_COMPLETED = 'campaign.completed'
}

interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: Date;
  data: {
    campaignId: string;
    contactId: string;
    email: string;
    messageId?: string;
    url?: string; // for click events
    metadata?: Record<string, any>;
  };
}
```

### API Endpoints
```typescript
// Register webhook
POST /api/webhooks
{
  url: "https://yourapp.com/webhooks/email-events",
  events: ["email.opened", "email.clicked"],
  secret: "webhook-secret-key"
}

// List webhooks
GET /api/webhooks

// Delete webhook
DELETE /api/webhooks/:id

// Retry failed delivery
POST /api/webhooks/:id/retry
```

### Implementation
```typescript
// Emit webhook event
async function emitWebhookEvent(event: WebhookEvent) {
  // Get registered webhooks
  const webhooks = await db
    .select()
    .from(webhooks)
    .where(inArray(col('events'), [event.type]));
  
  // Send to each webhook
  for (const webhook of webhooks) {
    await deliverWebhook(webhook, event);
  }
}

// Deliver webhook with retry
async function deliverWebhook(
  webhook: Webhook,
  event: WebhookEvent,
  attempt = 1
) {
  const maxAttempts = 5;
  const delayMs = Math.pow(2, attempt - 1) * 1000; // exponential backoff
  
  try {
    const payload = JSON.stringify(event);
    const signature = generateSignature(payload, webhook.secret);
    
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-ID': webhook.id
      },
      body: payload
    });
    
    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }
    
    // Log success
    await logWebhookDelivery(webhook.id, event.id, 'success');
  } catch (error) {
    if (attempt < maxAttempts) {
      // Retry after delay
      setTimeout(
        () => deliverWebhook(webhook, event, attempt + 1),
        delayMs
      );
    } else {
      // Log failure after max attempts
      await logWebhookDelivery(webhook.id, event.id, 'failed', error);
    }
  }
}

function generateSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}
```

### Webhook Payload Example
```json
{
  "id": "evt_123456",
  "type": "email.opened",
  "timestamp": "2025-01-15T10:30:00Z",
  "data": {
    "campaignId": "camp_123",
    "contactId": "cont_456",
    "email": "user@example.com",
    "messageId": "msg_789",
    "metadata": {
      "deviceType": "mobile",
      "country": "US"
    }
  }
}
```

---

## 🔗 Feature 5: ESP Integrations

### HubSpot Integration

#### Setup
```typescript
import hubspot from '@hubapi/api-client';

const client = new hubspot.Client({
  accessToken: process.env.HUBSPOT_TOKEN
});
```

#### Sync Contacts
```typescript
async function syncContactsToHubSpot(
  campaignId: string,
  contacts: Contact[]
) {
  // Get HubSpot contacts
  const hubspotContact = await client.crm.contacts.basicApi.getById(
    contact.externalId,
    ['email', 'firstname', 'lastname']
  );
  
  // Create/update properties
  await client.crm.contacts.basicApi.update(contact.externalId, {
    properties: {
      email: contact.email,
      firstname: contact.firstName,
      lastname: contact.lastName,
      hs_lead_status: 'open',
      campaign_id: campaignId
    }
  });
}
```

#### Track Campaign Events
```typescript
async function trackHubSpotEvent(
  contactId: string,
  eventType: string,
  properties: Record<string, any>
) {
  // Create engagement
  await client.crm.contacts.associationsApi.create(
    contactId,
    'contacts_to_emails',
    {
      properties: {
        hs_email_open: eventType === 'opened',
        hs_email_click: eventType === 'clicked',
        ...properties
      }
    }
  );
}
```

### Salesforce Integration

#### Setup
```typescript
import jsforce from 'jsforce';

const connection = new jsforce.Connection({
  oauth2: {
    clientId: process.env.SALESFORCE_CLIENT_ID,
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
    redirectUri: process.env.SALESFORCE_REDIRECT_URI
  }
});
```

#### Sync Leads
```typescript
async function syncLeadsToSalesforce(
  campaignId: string,
  contacts: Contact[]
) {
  for (const contact of contacts) {
    await connection.sobject('Lead').create({
      FirstName: contact.firstName,
      LastName: contact.lastName,
      Email: contact.email,
      Company: contact.company,
      custom_campaign_id__c: campaignId,
      LeadSource: 'Email Campaign'
    });
  }
}
```

#### Log Activities
```typescript
async function logSalesforceActivity(
  leadId: string,
  activityType: string,
  description: string
) {
  await connection.sobject('Task').create({
    WhoId: leadId,
    Subject: activityType,
    Description: description,
    ActivityDate: new Date().toISOString().split('T')[0],
    Status: 'Completed'
  });
}
```

---

## 📋 Advanced Features Roadmap

### Week 1: A/B Testing
- [ ] Data model design
- [ ] API endpoints implementation
- [ ] Statistical significance calculation
- [ ] UI for A/B test creation

### Week 2: Conditional Personalization
- [ ] Syntax parser implementation
- [ ] Condition evaluation engine
- [ ] Block rendering logic
- [ ] Email builder integration

### Week 3: Analytics Dashboard
- [ ] Metrics collection system
- [ ] Real-time metric calculation
- [ ] Dashboard UI components
- [ ] Chart/visualization components

### Week 4: Webhooks & Integrations
- [ ] Webhook registration system
- [ ] Event delivery system
- [ ] HubSpot integration
- [ ] Salesforce integration

---

## ✅ Feature Checklist

### A/B Testing
- [ ] Database schema created
- [ ] API endpoints implemented
- [ ] Statistical analysis working
- [ ] UI components created
- [ ] Results dashboard built

### Conditional Personalization
- [ ] Parser implemented
- [ ] Condition engine working
- [ ] Block rendering correct
- [ ] Email builder updated
- [ ] Testing complete

### Analytics Dashboard
- [ ] Metrics collection active
- [ ] Real-time calculations working
- [ ] Dashboard rendered
- [ ] Charts displaying correctly
- [ ] Performance optimized

### Webhooks
- [ ] Webhook registration working
- [ ] Event delivery system working
- [ ] Retry logic implemented
- [ ] Signature verification working
- [ ] Testing complete

### Integrations
- [ ] HubSpot sync working
- [ ] Salesforce sync working
- [ ] Event logging working
- [ ] Error handling complete
- [ ] Documentation written

---

*Phase 5: Advanced Features*
*Status: Implementation Ready*
