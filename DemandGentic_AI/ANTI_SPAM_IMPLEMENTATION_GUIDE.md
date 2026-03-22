# Anti-Spam Implementation Guide: 50 AI Callers

## Implementation Status

### ✅ Already Implemented (Existing Infrastructure)

| Component | File | Status |
|-----------|------|--------|
| Number Pool Schema | [shared/number-pool-schema.ts](shared/number-pool-schema.ts) | ✅ Complete |
| Per-Number Pacing (20/hr, 100/day) | [number-router-service.ts](server/services/number-pool/number-router-service.ts#L62-L63) | ✅ Complete |
| Jitter Delay (80-160s) | [number-router-service.ts](server/services/number-pool/number-router-service.ts#L64-L65) | ✅ Complete |
| Number Reputation System | [number-pool-schema.ts](shared/number-pool-schema.ts#L150-L180) | ✅ Complete |
| Automated Cooldowns | [number-pool-schema.ts](shared/number-pool-schema.ts#L50-L57) | ✅ Complete |
| Business Hours Check | [ai-campaign-orchestrator.ts](server/lib/ai-campaign-orchestrator.ts#L75-L100) | ✅ Complete |
| DNC Processing | [disposition-engine.ts](server/services/disposition-engine.ts) | ✅ Complete |
| Max Concurrent Calls (50 global) | [ai-campaign-orchestrator.ts](server/lib/ai-campaign-orchestrator.ts#L35) | ✅ Complete |
| Geographic/Local Presence Routing | [number-router-service.ts](server/services/number-pool/number-router-service.ts#L310-L330) | ✅ Complete |

### 🆕 Newly Implemented (This Session)

| Component | File | Description |
|-----------|------|-------------|
| **Number Warmup Service** | [number-warmup-service.ts](server/services/number-pool/number-warmup-service.ts) | Gradual ramp-up for new numbers over 5 days |
| **Opening Variation Engine** | [opening-variation-engine.ts](server/services/opening-variation-engine.ts) | Anti-fingerprinting with 7 opening variations |
| **Call Quality Tracker** | [call-quality-tracker.ts](server/services/call-quality-tracker.ts) | First-7-second hang-up detection & number health |
| **Router Warmup Integration** | [number-router-service.ts](server/services/number-pool/number-router-service.ts) | Warmup limits enforced during routing |
| **Voice Dialer Variations** | [voice-dialer.ts](server/services/voice-dialer.ts) | Opening micro-variations applied |
| **Disposition Quality Tracking** | [disposition-engine.ts](server/services/disposition-engine.ts) | Call quality recorded on disposition |

---

## Configuration Guide

### 1. Number Pool Sizing (Rule: 1 DID per 8-12 calls/hour)

```typescript
// From number-warmup-service.ts
const { minimumNumbers, recommendedNumbers, withWarmupBuffer } = 
  calculateRequiredPoolSize(targetCallsPerHour);

// Example: 50 AI callers at 10 calls/hour each = 500 calls/hour
// Minimum: 25 numbers (at 20/hr max)
// Recommended: 50 numbers (at 10/hr conservative)  
// With warmup buffer: 60 numbers
```

**For 50 AI Callers:**
- Minimum: 400-500 numbers over time
- Active pool: 50-60 numbers at any given moment
- Rotation: Daily number rotation automatically handled

### 2. Number Warmup Schedule

New numbers ramp up automatically:

| Day | Max/Hour | Max/Day | % of Full |
|-----|----------|---------|-----------|
| 1 | 3 | 15 | 15% |
| 2 | 6 | 30 | 30% |
| 3 | 10 | 50 | 50% |
| 4 | 15 | 75 | 75% |
| 5+ | 20 | 100 | 100% |

**Enable warmup:** Numbers are automatically warmed up based on `acquiredAt` timestamp.

### 3. Opening Variations (Anti-Fingerprinting)

The system automatically applies variations:

```typescript
// 7 semantic variations available
const variations = [
  'Hello, may I please speak with {{name}}?',
  'Hey—is {{name}} available?',
  'Hi, I was hoping to reach {{name}}—is this a good time?',
  'Quick question—can I speak with {{name}}?',
  'Sorry to bother you—is {{name}} around?',
  "Hello, I'm calling to speak with {{name}}—are they available?",
  "Hey, I'm trying to reach {{name}}—any chance they're free?",
];
```

**Configuration:** 30% of calls automatically get varied openings.

### 4. Call Quality Thresholds

Critical signals that trigger automated cooldowns:

| Signal | Warning | Critical | Cooldown |
|--------|---------|----------|----------|
| First 7-sec hangups | 15% | 25% | 12 hours |
| Immediate hangups (<3s) | 10% | 20% | 24 hours |
| Short calls (<20s) | 30% | 50% | 12 hours |
| Answer rate | <20% | <10% | 24 hours |

---

## How to Enable

### 1. Enable Number Pool Routing

Set environment variable:
```bash
TELNYX_NUMBER_POOL_ENABLED=true
```

### 2. Add Numbers to Pool

```bash
# Run the sync script to import numbers from Telnyx
npx tsx sync-telnyx-raw.ts
```

Or use the API:
```typescript
// POST /api/number-pool/numbers
{
  "phoneNumberE164": "+12025551234",
  "telnyxNumberId": "...",
  "region": "DC",
  "areaCode": "202"
}
```

### 3. Monitor Number Health

```typescript
// Get numbers needing attention
const unhealthyNumbers = await callQualityTracker.getNumbersNeedingAttention();

// Check specific number health
const health = await callQualityTracker.checkNumberHealth(numberId);
// Returns: { healthScore: 85, status: 'healthy', issues: [], recommendations: [] }
```

### 4. Check Pool Capacity

```typescript
const capacity = await numberWarmupService.estimatePoolCapacity();
// Returns:
// {
//   totalNumbers: 50,
//   warmedUpNumbers: 40,
//   warmingNumbers: 10,
//   effectiveHourlyCapacity: 720, // With warmup adjustment
//   effectiveDailyCapacity: 3600
// }
```

---

## Best Practices Summary

### ✅ DO
1. **Rotate numbers daily** - Don't burn single numbers
2. **Use permission openers** - "Did I catch you at a bad time?"
3. **Keep first 7 seconds short** - Ask for the person, then STOP
4. **Respect DNC immediately** - Process within disposition engine
5. **Monitor number health daily** - Dashboard or API checks
6. **Warm new numbers gradually** - 5-day ramp built in

### ❌ DON'T
1. **Don't exceed 15-20 calls/hour per number** - Hard cap enforced
2. **Don't use same opening audio** - Variation engine handles this
3. **Don't ignore short call patterns** - Auto-cooldown triggers
4. **Don't call outside business hours** - Already enforced
5. **Don't call same prospect from same number within 24h** - Filtered

---

## Monitoring Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/number-pool/numbers` | List all numbers with health |
| `GET /api/number-pool/numbers/:id/health` | Individual number health |
| `GET /api/number-pool/metrics/warmup` | Numbers in warmup phase |
| `GET /api/number-pool/metrics/capacity` | Pool capacity estimate |
| `GET /api/number-pool/alerts` | Numbers needing attention |

---

## Next Steps (Optional Enhancements)

1. **Redis for concurrent call tracking** - Currently in-memory
2. **A/B testing for openers** - Track which variations perform best
3. **STIR/SHAKEN attestation** - Carrier-level caller ID verification
4. **Real-time dashboard** - Visual number health monitoring
5. **Automated number provisioning** - Auto-add numbers when capacity low