# Resources Center API Specification

## Overview
This document specifies the API endpoint that the **Pivotal B2B Resources Center** (public-facing Repl) must implement to receive content pushed from the **Pivotal CRM Dashboard** (internal Repl).

## Security Architecture

### HMAC-SHA256 Authentication
All requests are authenticated using HMAC-SHA256 signatures to ensure content integrity and prevent unauthorized access.

#### Authentication Headers
- `X-Signature`: HMAC-SHA256 signature of the request
- `X-Timestamp`: Unix timestamp (milliseconds) when request was created

#### Signature Generation
```javascript
const message = `${timestamp}.${JSON.stringify(payload)}`;
const signature = crypto
  .createHmac('sha256', PUSH_SECRET_KEY)
  .update(message)
  .digest('hex');
```

#### Signature Verification (Resources Center) - **MANDATORY**
```javascript
function verifyHMACSignature(payload, timestamp, receivedSignature) {
  // CRITICAL: Verify timestamp is recent (prevent replay attacks)
  // This check is MANDATORY and must be implemented
  const now = Date.now();
  const requestAge = now - parseInt(timestamp);
  
  // Reject requests older than 5 minutes
  if (requestAge > 300000) { // 5 minutes = 300,000ms
    throw new Error('Request timestamp too old - possible replay attack');
  }
  
  // Reject requests from the future (clock skew tolerance: 1 minute)
  if (requestAge < -60000) {
    throw new Error('Request timestamp is in the future');
  }

  // Regenerate signature
  const message = `${timestamp}.${JSON.stringify(payload)}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.PUSH_SECRET_KEY)
    .update(message)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(receivedSignature, 'hex')
  )) {
    throw new Error('Invalid signature');
  }

  return true;
}
```

**⚠️ SECURITY REQUIREMENT**: The timestamp validation is NOT optional. Without it, captured requests can be replayed indefinitely if the shared secret is compromised. The 5-minute window provides a balance between security and allowing for minor clock drift between systems.

**Security Considerations**:
- The current implementation allows replay attacks within the 5-minute timestamp window
- For enhanced security, consider implementing a nonce/request-ID tracking system:
  ```javascript
  // Store processed request IDs in Redis with 5-minute TTL
  const requestId = crypto.randomUUID();
  if (await redis.exists(`push:${requestId}`)) {
    throw new Error('Duplicate request - possible replay');
  }
  await redis.setex(`push:${requestId}`, 300, '1'); // 5 min expiry
  ```
- The 5-minute window is acceptable for most use cases where content pushes are not highly sensitive
- If stricter replay prevention is needed, reduce the window to 60 seconds and implement request-ID tracking

## Endpoint Specification

### POST /api/import/content

**Purpose**: Receive and import content assets from Dashboard

**Authentication**: HMAC-SHA256 via headers

**Request Headers**:
```
Content-Type: application/json
X-Signature: <hmac-sha256-signature>
X-Timestamp: <unix-timestamp-ms>
```

**Request Payload**:
```typescript
interface ContentImportPayload {
  contentId: string;         // Original content ID from Dashboard
  contentType: 'content_asset' | 'event' | 'resource' | 'news';
  
  // Common fields (all types)
  title: string;             // Content title
  slug: string;              // URL-friendly slug
  summary?: string;          // Short description/excerpt
  bodyHtml?: string;         // Full HTML content
  thumbnailUrl?: string;     // Featured image URL
  tags?: string[];           // Content tags/categories
  metadata?: any;            // Additional custom metadata
  syncedAt: string;          // ISO 8601 timestamp of sync
  
  // Content Asset specific fields (contentType: 'content_asset')
  assetType?: string;        // landing_page, email_template, social_post, pdf, image, video
  ctaLink?: string;          // Call-to-action link
  formId?: string;           // Associated form ID (if applicable)
  
  // Event specific fields (contentType: 'event')
  eventType?: string;        // webinar, forum, executive_dinner, roundtable, conference
  eventDate?: string;        // ISO 8601 timestamp
  eventEndDate?: string;     // ISO 8601 timestamp (optional)
  locationType?: string;     // virtual, in_person, hybrid
  location?: string;         // Physical address or virtual platform
  registrationUrl?: string;  // Event registration link
  communities?: string[];    // finance, marketing, it, hr, cx_ux, data_ai, ops
  
  // Resource specific fields (contentType: 'resource')
  resourceType?: string;     // ebook, infographic, white_paper, guide, case_study
  downloadUrl?: string;      // Direct download link
  gatedByForm?: boolean;     // Whether form is required
}
```

**Example Request - Content Asset**:
```bash
POST https://resources.pivotal-b2b.com/api/import/content
Headers:
  Content-Type: application/json
  X-Signature: a7f3b8c9d2e1f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9
  X-Timestamp: 1697123456789

Body:
{
  "contentId": "ast_123xyz",
  "contentType": "content_asset",
  "assetType": "landing_page",
  "title": "The Business Owner's Guide to Simplifying HR",
  "slug": "simplify-hr-guide",
  "summary": "Learn how to save 5–10 hours per week with smarter HR processes",
  "bodyHtml": "<h1>Simplifying HR</h1><p>Content here...</p>",
  "thumbnailUrl": "https://assets.pivotal.com/hr-guide.jpg",
  "ctaLink": "https://crm.pivotal-b2b.com/demo",
  "formId": "frm_109",
  "tags": ["HR", "Productivity", "Guide"],
  "metadata": {
    "industry": "Professional Services",
    "wordCount": 1500
  },
  "syncedAt": "2025-10-13T09:00:00Z"
}
```

**Example Request - Event**:
```bash
POST https://resources.pivotal-b2b.com/api/import/content
Headers:
  Content-Type: application/json
  X-Signature: <signature>
  X-Timestamp: <timestamp>

Body:
{
  "contentId": "evt_456abc",
  "contentType": "event",
  "eventType": "webinar",
  "title": "Future of AI in B2B Marketing",
  "slug": "future-ai-b2b-marketing-webinar",
  "summary": "Join industry experts for a deep dive into AI-powered marketing strategies",
  "bodyHtml": "<h1>Webinar Details</h1><p>Agenda and speakers...</p>",
  "thumbnailUrl": "https://assets.pivotal.com/ai-webinar.jpg",
  "eventDate": "2025-11-15T14:00:00Z",
  "eventEndDate": "2025-11-15T15:30:00Z",
  "locationType": "virtual",
  "location": "Zoom",
  "registrationUrl": "https://events.pivotal.com/register/ai-webinar",
  "communities": ["marketing", "data_ai"],
  "tags": ["AI", "Marketing", "Webinar"],
  "metadata": {
    "speakers": ["Dr. Jane Smith", "John Doe"],
    "capacity": 500
  },
  "syncedAt": "2025-10-13T09:00:00Z"
}
```

**Example Request - Resource**:
```bash
POST https://resources.pivotal-b2b.com/api/import/content
Headers:
  Content-Type: application/json
  X-Signature: <signature>
  X-Timestamp: <timestamp>

Body:
{
  "contentId": "res_789def",
  "contentType": "resource",
  "resourceType": "ebook",
  "title": "The Complete Guide to Account-Based Marketing",
  "slug": "complete-guide-account-based-marketing",
  "summary": "A comprehensive 50-page guide to implementing ABM strategies",
  "bodyHtml": "<h1>Table of Contents</h1><p>Preview content...</p>",
  "thumbnailUrl": "https://assets.pivotal.com/abm-guide-cover.jpg",
  "downloadUrl": "https://cdn.pivotal.com/resources/abm-guide.pdf",
  "gatedByForm": true,
  "formId": "frm_204",
  "tags": ["ABM", "Marketing", "eBook"],
  "metadata": {
    "pageCount": 50,
    "fileSize": "5.2MB"
  },
  "syncedAt": "2025-10-13T09:00:00Z"
}
```

**Example Request - News**:
```bash
POST https://resources.pivotal-b2b.com/api/import/content
Headers:
  Content-Type: application/json
  X-Signature: <signature>
  X-Timestamp: <timestamp>

Body:
{
  "contentId": "news_321ghi",
  "contentType": "news",
  "title": "Pivotal CRM Announces New AI-Powered Lead Scoring",
  "slug": "pivotal-crm-ai-lead-scoring-announcement",
  "summary": "New machine learning capabilities help sales teams prioritize high-value leads",
  "bodyHtml": "<h1>Press Release</h1><p>Full announcement...</p>",
  "thumbnailUrl": "https://assets.pivotal.com/news-ai-scoring.jpg",
  "tags": ["Product Update", "AI", "Lead Scoring"],
  "metadata": {
    "author": "PR Team",
    "category": "Product News"
  },
  "syncedAt": "2025-10-13T09:00:00Z"
}
```

**Response (Success - 200/201)**:
```json
{
  "status": "success",
  "message": "Content imported successfully",
  "externalId": "rc_content_456",
  "publicUrl": "https://resources.pivotal-b2b.com/resources/simplify-hr-guide",
  "syncedAt": "2025-10-13T09:00:05Z"
}
```

**Response (Error - 400)**:
```json
{
  "status": "error",
  "message": "Invalid signature",
  "code": "INVALID_SIGNATURE"
}
```

**Response (Error - 422)**:
```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [
    {
      "field": "title",
      "message": "Title is required"
    }
  ]
}
```

## Database Schema (Resources Center)

### Recommended Schema
```sql
CREATE TABLE imported_content (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR UNIQUE NOT NULL,  -- assetId from Dashboard
  asset_type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  slug VARCHAR UNIQUE NOT NULL,
  summary TEXT,
  body_html TEXT,
  thumbnail_url VARCHAR,
  cta_link VARCHAR,
  form_id VARCHAR,
  tags TEXT[],
  metadata JSONB,
  status VARCHAR DEFAULT 'published',
  synced_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_imported_content_type ON imported_content(asset_type);
CREATE INDEX idx_imported_content_slug ON imported_content(slug);
CREATE INDEX idx_imported_content_tags ON imported_content USING GIN(tags);
```

## Content Types & Routing

### Supported Content Types
| Content Type    | Sub Type        | Public Route                    | Use Case                          |
|-----------------|-----------------|----------------------------------|------------------------------------|
| content_asset   | landing_page    | /resources/:slug                 | Gated content, lead gen           |
| content_asset   | email_template  | N/A (internal use)               | Email campaign templates          |
| content_asset   | social_post     | N/A (external platforms)         | Social media content              |
| content_asset   | pdf             | /resources/:slug                 | Downloadable documents            |
| content_asset   | image           | /media/:slug                     | Visual assets                     |
| content_asset   | video           | /media/videos/:slug              | Video content                     |
| event           | webinar         | /events/:slug                    | Virtual webinars                  |
| event           | forum           | /events/:slug                    | Discussion forums                 |
| event           | executive_dinner| /events/:slug                    | Executive networking              |
| event           | roundtable      | /events/:slug                    | Round table discussions           |
| event           | conference      | /events/:slug                    | Large conferences                 |
| resource        | ebook           | /resources/ebooks/:slug          | Long-form guides                  |
| resource        | infographic     | /resources/infographics/:slug    | Visual data presentations         |
| resource        | white_paper     | /resources/whitepapers/:slug     | Technical documents               |
| resource        | guide           | /resources/guides/:slug          | How-to guides                     |
| resource        | case_study      | /case-studies/:slug              | Customer success stories          |
| news            | N/A             | /news/:slug                      | Press releases, announcements     |

### Dynamic Routing Example
```javascript
// Resources Center routes.js
app.get('/resources/:slug', async (req, res) => {
  const content = await db.query(
    'SELECT * FROM imported_content WHERE slug = $1 AND asset_type = $2',
    [req.params.slug, 'landing_page']
  );
  
  if (!content) {
    return res.status(404).render('404');
  }
  
  res.render('landing-page', { content });
});
```

## Form Prefill Integration

### Query Parameter Mapping
When Dashboard links to Resources Center content with contact data:

**Dashboard sends**:
```
https://resources.pivotal-b2b.com/resources/simplify-hr-guide
  ?first_name=John
  &email=john@acme.com
  &company=Acme%20Ltd
  &source=email_campaign_123
```

**Resources Center parses and prefills**:
```javascript
// Form component (React/Vue/etc)
const urlParams = new URLSearchParams(window.location.search);

const formData = {
  firstName: urlParams.get('first_name') || '',
  email: urlParams.get('email') || '',
  company: urlParams.get('company') || '',
  // Hidden field for tracking
  source: urlParams.get('source') || 'organic'
};
```

### Form Submission Flow
1. User fills/submits form on Resources Center
2. Form data POSTs to Dashboard's lead capture endpoint
3. Dashboard creates lead record with source tracking
4. Optional: Resources Center shows thank-you page

## Environment Variables (Resources Center)

```env
# Security
PUSH_SECRET_KEY=<shared-secret-with-dashboard>

# Database
DATABASE_URL=<postgresql-connection-string>

# Dashboard Integration
DASHBOARD_LEAD_CAPTURE_URL=https://dashboard.pivotal.com/api/leads/capture
```

## Environment Variables (Dashboard)

```env
# Security
PUSH_SECRET_KEY=<shared-secret-with-resources-center>

# Resources Center
RESOURCES_CENTER_URL=https://resources.pivotal-b2b.com
```

## Retry & Error Handling

### Dashboard Retry Logic
- Max attempts: 3
- Backoff: Exponential (2^attempt * 1000ms)
- Statuses tracked: pending → in_progress → success/failed

### Resources Center Error Codes
| Code              | HTTP | Description                        |
|-------------------|------|------------------------------------|
| INVALID_SIGNATURE | 401  | HMAC signature verification failed |
| TIMESTAMP_EXPIRED | 401  | Request timestamp too old          |
| VALIDATION_ERROR  | 422  | Payload validation failed          |
| DUPLICATE_CONTENT | 409  | Content with same externalId exists|
| SERVER_ERROR      | 500  | Internal server error              |

## Testing the Integration

### 1. Generate Test Signature
```javascript
const crypto = require('crypto');
const payload = {
  assetId: 'test_123',
  assetType: 'landing_page',
  title: 'Test Content',
  syncedAt: new Date().toISOString()
};

const payloadString = JSON.stringify(payload);
const timestamp = Date.now().toString();
const signature = crypto
  .createHmac('sha256', 'your-shared-secret')
  .update(`${timestamp}.${payloadString}`)
  .digest('hex');

console.log('X-Signature:', signature);
console.log('X-Timestamp:', timestamp);
```

### 2. Test with cURL
```bash
curl -X POST https://resources.pivotal-b2b.com/api/import/content \
  -H "Content-Type: application/json" \
  -H "X-Signature: <generated-signature>" \
  -H "X-Timestamp: <timestamp>" \
  -d '{
    "assetId": "test_123",
    "assetType": "landing_page",
    "title": "Test Content",
    "slug": "test-content",
    "syncedAt": "2025-10-13T09:00:00Z"
  }'
```

### 3. Verify Response
- Status: 200 or 201
- Body contains `externalId` and `publicUrl`
- Check database for new record

## Monitoring & Analytics

### Push Metrics (Dashboard)
- Total pushes attempted
- Success rate
- Average response time
- Failed push reasons

### Content Metrics (Resources Center)
- Views per asset
- Form submissions per asset
- Conversion rate by asset type
- Top performing content

### Webhook (Optional)
Resources Center can send engagement data back to Dashboard:

```javascript
// POST to Dashboard webhook
POST https://dashboard.pivotal.com/api/webhooks/content-engagement
{
  "externalId": "ast_123xyz",
  "eventType": "view" | "download" | "form_submit",
  "timestamp": "2025-10-13T10:30:00Z",
  "metadata": {
    "visitorId": "visitor_789",
    "referrer": "google.com"
  }
}
```

## Support & Troubleshooting

### Common Issues

**1. Signature Mismatch**
- Ensure both systems use same `PUSH_SECRET_KEY`
- Check payload is identical (no whitespace changes)
- Verify timestamp is in milliseconds

**2. Duplicate Content**
- Check `external_id` (assetId) uniqueness
- Implement upsert logic if updates are expected

**3. Missing Content**
- Verify slug generation is URL-safe
- Check asset_type routing matches expected values

### Debug Mode
```javascript
// Resources Center endpoint (dev only)
if (process.env.NODE_ENV === 'development') {
  console.log('Received payload:', req.body);
  console.log('Signature:', req.headers['x-signature']);
  console.log('Timestamp:', req.headers['x-timestamp']);
}
```

---

## Quick Start Checklist

### Resources Center Setup
- [ ] Install HMAC signature verification middleware
- [ ] Create `imported_content` database table
- [ ] Implement POST `/api/import/content` endpoint
- [ ] Set `PUSH_SECRET_KEY` environment variable
- [ ] Add dynamic routing for content types
- [ ] Implement form prefill logic
- [ ] Test with Dashboard integration

### Dashboard Setup (Already Complete ✅)
- [x] Push service with HMAC signature generation
- [x] Push tracking database schema
- [x] API endpoints for push/retry
- [x] UI for push management
- [x] Environment variables configured

---

**Version**: 1.0  
**Last Updated**: October 13, 2025  
**Maintainer**: Pivotal CRM Team
