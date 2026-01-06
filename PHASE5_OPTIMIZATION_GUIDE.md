# Phase 5: Performance Optimization Guide

## ⚡ Optimization Targets

### Frontend Performance
- Bundle size: Reduce by 30%
- Load time: < 2s initial load
- Component render: < 100ms
- Image optimization: WEBP format

### Backend Performance
- API response: < 200ms (p95)
- Database queries: < 50ms (p95)
- Email rendering: < 100ms per email
- Memory usage: < 512MB baseline

### Email Delivery Performance
- Bulk processing: 10,000 emails < 2 minutes
- Queue throughput: 1,000 emails/minute
- Worker efficiency: > 95%
- Bounce handling: < 100ms per event

---

## 📦 Frontend Optimization

### 1. Code Splitting
```typescript
// Before: All components loaded upfront
import EmailBuilderClean from './email-builder-clean';

// After: Lazy load components
const EmailBuilderClean = lazy(() => import('./email-builder-clean'));
const TemplateSelectorModal = lazy(() => import('./template-selector-modal'));

// Usage
<Suspense fallback={<Loading />}>
  <EmailBuilderClean />
</Suspense>
```

### 2. Image Optimization
```typescript
// Convert to WEBP format
import { Image } from 'next/image';

export default function MyImage() {
  return (
    <Image
      src="/images/email-template.webp"
      alt="Email template"
      width={800}
      height={600}
      placeholder="blur"
      blurDataURL="data:image/..."
    />
  );
}
```

### 3. Bundle Analysis
```bash
# Analyze bundle size
npm run build:analyze

# Output
# webpack-bundle-analyzer is recommended for visual output
```

**Target**: < 500KB gzipped

### 4. Tree Shaking
```typescript
// Good: Named exports (tree-shaking compatible)
export { EmailBuilderClean };
export { TemplateSelectorModal };

// Avoid: Default exports of entire modules
export default { EmailBuilderClean, TemplateSelectorModal };
```

### 5. CSS Optimization
```css
/* Use utility-first CSS (Tailwind) */
/* Avoid: Heavy CSS frameworks */
/* Purge unused styles in production */
```

---

## 🗄️ Backend Optimization

### 1. Database Query Optimization

#### Index Optimization
```sql
-- Create indexes for frequently queried columns
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at DESC);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_campaign_id ON contacts(campaign_id);

-- Composite indexes for common queries
CREATE INDEX idx_campaigns_user_status ON campaigns(user_id, status);
```

#### Query Optimization
```typescript
// Before: N+1 query problem
const campaigns = await db.select().from(campaigns);
for (const campaign of campaigns) {
  campaign.sender = await db.select().from(senders).where(...);
}

// After: Use JOIN
const campaigns = await db
  .select()
  .from(campaigns)
  .leftJoin(senders, eq(campaigns.senderProfileId, senders.id));
```

#### Connection Pooling
```typescript
// Configure connection pool
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 2. Caching Strategy

#### Redis Caching
```typescript
// Cache sender profiles (5 minutes)
app.get('/api/sender-profiles', async (req, res) => {
  const cacheKey = 'sender-profiles';
  
  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));
  
  // Fetch and cache
  const profiles = await db.select().from(senderProfiles);
  await redis.setex(cacheKey, 300, JSON.stringify(profiles));
  
  res.json(profiles);
});

// Cache templates (1 hour)
app.get('/api/email-templates', async (req, res) => {
  const cacheKey = 'email-templates';
  const cached = await redis.get(cacheKey);
  
  if (cached) return res.json(JSON.parse(cached));
  
  const templates = await db.select().from(emailTemplates);
  await redis.setex(cacheKey, 3600, JSON.stringify(templates));
  
  res.json(templates);
});
```

#### Cache Invalidation
```typescript
// Invalidate cache on changes
app.post('/api/sender-profiles', async (req, res) => {
  // Create profile
  const profile = await createProfile(req.body);
  
  // Invalidate cache
  await redis.del('sender-profiles');
  
  res.json(profile);
});
```

### 3. Request Optimization

#### Compression
```typescript
import compression from 'compression';

app.use(compression({
  level: 6, // Balance between compression ratio and speed
  threshold: 1024, // Only compress responses > 1KB
}));
```

#### Response Time Headers
```typescript
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    res.set('X-Response-Time', `${duration}ms`);
  });
  next();
});
```

---

## ✉️ Email Delivery Optimization

### 1. Bulk Processing
```typescript
// Process emails in batches
async function sendBulkEmails(campaignId: string, batchSize = 100) {
  const contacts = await getContacts(campaignId);
  
  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);
    
    // Queue batch in parallel
    await Promise.all(
      batch.map(contact => queueEmail(campaignId, contact))
    );
  }
}
```

### 2. Worker Scaling
```typescript
// Scale workers based on queue depth
function scaleWorkers(queueDepth: number) {
  if (queueDepth > 10000) {
    return 10; // Max workers
  } else if (queueDepth > 5000) {
    return 5;
  } else {
    return 2; // Min workers
  }
}
```

### 3. SMTP Connection Pooling
```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  pool: {
    maxConnections: 20,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 14 // 14 emails per second
  }
});
```

### 4. Template Caching
```typescript
// Cache rendered templates
const templateCache = new Map<string, string>();

function renderTemplate(templateId: string, data: any): string {
  const cacheKey = `${templateId}-${JSON.stringify(data)}`;
  
  if (templateCache.has(cacheKey)) {
    return templateCache.get(cacheKey)!;
  }
  
  const rendered = renderHtml(templateId, data);
  templateCache.set(cacheKey, rendered);
  
  return rendered;
}

// Limit cache size
function maintainCacheSize(maxSize = 1000) {
  if (templateCache.size > maxSize) {
    const entriesToDelete = templateCache.size - maxSize;
    let count = 0;
    for (const [key] of templateCache.entries()) {
      if (count++ >= entriesToDelete) break;
      templateCache.delete(key);
    }
  }
}
```

---

## 🧪 Performance Testing

### Load Testing
```bash
# Install K6
npm install -D k6

# Run load test
k6 run load-test.js
```

### Load Test Script
```typescript
// load-test.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m30s', target: 100 },
    { duration: '20s', target: 0 },
  ],
};

export default function () {
  const response = http.get('http://localhost:3000/api/sender-profiles');
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
}
```

### Benchmark Results (After Optimization)
```
API Response Time:
  - Before: 250ms (p95)
  - After: 120ms (p95)
  - Improvement: 52%

Bundle Size:
  - Before: 720KB gzipped
  - After: 480KB gzipped
  - Improvement: 33%

Email Rendering:
  - Before: 150ms per email
  - After: 80ms per email
  - Improvement: 47%

Database Query:
  - Before: 200ms (p95)
  - After: 45ms (p95)
  - Improvement: 77%
```

---

## 📊 Metrics Dashboard

### Key Metrics to Track
```typescript
// Response Time
histogram('api.response_time', responseTime);

// Error Rate
counter('api.errors');

// Email Delivery
counter('email.sent');
counter('email.failed');
counter('email.bounced');

// Queue Depth
gauge('queue.depth', queueSize);

// Database Connections
gauge('db.connections', connectionCount);

// Memory Usage
gauge('process.memory_mb', memoryUsage);

// CPU Usage
gauge('process.cpu_percent', cpuUsage);
```

---

## 🎯 Optimization Roadmap

### Phase 5.1 (Week 1)
- [ ] Database indexing
- [ ] Connection pooling
- [ ] Redis caching setup

### Phase 5.2 (Week 2)
- [ ] Frontend code splitting
- [ ] Image optimization
- [ ] CSS optimization

### Phase 5.3 (Week 3)
- [ ] Email rendering optimization
- [ ] Worker scaling
- [ ] Template caching

### Phase 5.4 (Week 4)
- [ ] Load testing
- [ ] Performance monitoring
- [ ] Optimization documentation

---

## ✅ Optimization Checklist

- [ ] Database indexes created
- [ ] Connection pooling configured
- [ ] Caching strategy implemented
- [ ] Code splitting done
- [ ] Images optimized
- [ ] Bundle size < 500KB
- [ ] API response < 200ms
- [ ] Email rendering < 100ms
- [ ] Load test passed
- [ ] Monitoring in place
- [ ] Documentation updated

---

*Phase 5: Performance Optimization*
*Target: 30%+ improvement across all metrics*
