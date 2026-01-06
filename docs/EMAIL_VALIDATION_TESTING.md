# API-Free Email Validation Testing Guide

This guide explains how to test the accuracy and performance of the built-in API-free email validation system.

## 🔧 Configuration Setup

### 1. Enable SMTP Validation (Recommended for Accuracy)

In your `.env` file or Replit Secrets panel, set:

```bash
SKIP_SMTP_VALIDATION=false
```

**Why?** SMTP validation provides the most accurate results by actually connecting to the mail server and verifying if the email address exists. When set to `true`, the system only performs syntax and DNS checks.

### 2. Optional Configuration Tuning

You can fine-tune the validation engine with these environment variables:

```bash
# DNS/MX resolution timeout (default: 3000ms)
DNS_TIMEOUT_MS=3000

# SMTP connection timeout (default: 10000ms)
SMTP_CONNECT_TIMEOUT_MS=10000

# Domain cache TTL in hours (default: 24)
DOMAIN_CACHE_TTL_HOURS=24

# HELO domain for SMTP handshake (default: validator.pivotal-b2b.ai)
VALIDATOR_HELO=validator.pivotal-b2b.ai

# MAIL FROM for SMTP validation (default: null-sender@pivotal-b2b.ai)
VALIDATOR_MAIL_FROM=null-sender@pivotal-b2b.ai
```

## 🧪 Testing Methods

### Method 1: API Testing (Recommended)

Use the dedicated test endpoints to validate emails and analyze results.

#### Check Validation System Status

```bash
GET /api/test/email-validation/status
```

**Response:**
```json
{
  "configuration": {
    "skipSmtpValidation": false,
    "dnsTimeout": "3000ms",
    "smtpTimeout": "10000ms",
    "domainCacheTtl": "24 hours",
    "validatorHelo": "validator.pivotal-b2b.ai",
    "validatorMailFrom": "null-sender@pivotal-b2b.ai"
  },
  "domainCache": {
    "totalCachedDomains": 523,
    "activeCachedDomains": 498,
    "expiredCachedDomains": 25,
    "domainsWithMx": 487,
    "domainsWithA": 476
  },
  "recommendations": {
    "enableSmtpValidation": "SMTP validation is enabled",
    "cacheStatus": "All cached domains are current"
  }
}
```

#### Test Single Email

```bash
POST /api/test/email-validation/single
Content-Type: application/json

{
  "email": "john.doe@example.com",
  "skipCache": false
}
```

**Response:**
```json
{
  "email": "john.doe@example.com",
  "duration": "1247ms",
  "result": {
    "status": "ok",
    "confidence": 95,
    "summary": {
      "syntaxValid": true,
      "hasMx": true,
      "hasSmtp": true,
      "smtpAccepted": true,
      "isRole": false,
      "isFree": false,
      "isDisposable": false
    },
    "trace": {
      "syntax": {
        "ok": true
      },
      "dns": {
        "hasMX": true,
        "hasA": true,
        "mxHosts": ["mx1.example.com", "mx2.example.com"]
      },
      "smtp": {
        "code": 250,
        "rcptOk": true,
        "isAcceptAll": false,
        "raw": ["220 mx1.example.com ESMTP", "250 OK"]
      },
      "risk": {
        "isRole": false,
        "isFree": false,
        "isDisposable": false,
        "reasons": []
      }
    }
  },
  "metadata": {
    "skipSmtpValidation": false,
    "dnsCacheTtl": "24 hours",
    "dnsTimeout": "3000ms",
    "smtpTimeout": "10000ms"
  }
}
```

#### Test Multiple Emails

```bash
POST /api/test/email-validation/batch
Content-Type: application/json

{
  "emails": [
    "valid@company.com",
    "invalid@nonexistent-domain-xyz.com",
    "admin@gmail.com",
    "user@mailinator.com"
  ],
  "skipCache": false
}
```

**Response:**
```json
{
  "totalEmails": 4,
  "totalDuration": "4532ms",
  "averageDuration": "1133ms",
  "results": [
    {
      "email": "valid@company.com",
      "duration": "1247ms",
      "status": "ok",
      "confidence": 95,
      "summary": { /* ... */ },
      "trace": { /* ... */ }
    },
    {
      "email": "invalid@nonexistent-domain-xyz.com",
      "duration": "3042ms",
      "status": "invalid",
      "confidence": 0,
      "summary": { /* ... */ },
      "trace": { /* ... */ }
    },
    {
      "email": "admin@gmail.com",
      "duration": "987ms",
      "status": "risky",
      "confidence": 65,
      "summary": {
        "isRole": true,
        "isFree": true
      }
    },
    {
      "email": "user@mailinator.com",
      "duration": "256ms",
      "status": "disposable",
      "confidence": 0,
      "summary": {
        "isDisposable": true
      }
    }
  ]
}
```

### Method 2: Using Verification Campaigns

You can test validation within the context of actual verification campaigns:

1. Create a verification campaign with `validationProvider: "api_free"`
2. Upload test contacts with various email types
3. Trigger eligibility evaluation
4. Monitor validation results in the campaign contacts view

## 📊 Validation Status Meanings

| Status | Confidence | Description |
|--------|-----------|-------------|
| `ok` | 85-100 | Email passed all checks and is deliverable |
| `accept_all` | 70-85 | Server accepts all addresses (catch-all) - may or may not be deliverable |
| `risky` | 40-70 | Valid syntax/DNS but has risk factors (role account, free provider) |
| `disposable` | 0 | Disposable/temporary email service detected |
| `invalid` | 0 | Failed syntax check or DNS lookup |
| `unknown` | 30-50 | Validation incomplete (timeout, network error) |

## 🎯 Comprehensive Test Cases

Here are recommended test cases covering various scenarios:

### Valid Corporate Emails
```json
{
  "emails": [
    "john.smith@microsoft.com",
    "jane.doe@salesforce.com",
    "contact@atlassian.com"
  ]
}
```
**Expected:** `status: "ok"`, high confidence (85-100)

### Invalid Syntax
```json
{
  "emails": [
    "notanemail",
    "@nodomain.com",
    "user@",
    "user name@example.com"
  ]
}
```
**Expected:** `status: "invalid"`, confidence: 0, `syntaxValid: false`

### Non-existent Domains
```json
{
  "emails": [
    "user@thisdomaindoesnotexist12345.com",
    "admin@fake-company-xyz.net"
  ]
}
```
**Expected:** `status: "invalid"`, confidence: 0, `hasMx: false`

### Role Accounts (Risky)
```json
{
  "emails": [
    "admin@company.com",
    "info@business.org",
    "support@service.com",
    "noreply@sender.com"
  ]
}
```
**Expected:** `status: "risky"`, `isRole: true`

### Free Email Providers (Risky)
```json
{
  "emails": [
    "user@gmail.com",
    "contact@outlook.com",
    "person@yahoo.com",
    "name@hotmail.com"
  ]
}
```
**Expected:** `status: "risky"` (if also role) or `"ok"`, `isFree: true`

### Disposable Emails
```json
{
  "emails": [
    "temp@mailinator.com",
    "user@guerrillamail.com",
    "test@10minutemail.com",
    "throwaway@temp-mail.org"
  ]
}
```
**Expected:** `status: "disposable"`, confidence: 0, `isDisposable: true`

### Catch-All Domains
```json
{
  "emails": [
    "randomuser123456@domain-with-catchall.com"
  ]
}
```
**Expected:** `status: "accept_all"`, `smtpAccepted: true`, `isAcceptAll: true`

## 🔍 Performance Benchmarks

### Expected Timing (with SMTP enabled)

| Validation Stage | Typical Duration |
|-----------------|------------------|
| Syntax Check | <1ms |
| DNS/MX Lookup (cached) | 1-5ms |
| DNS/MX Lookup (uncached) | 50-500ms |
| SMTP Probe | 500-3000ms |
| **Total (cached DNS)** | **~1000ms** |
| **Total (uncached DNS)** | **~2000ms** |

### Optimization Tips

1. **Domain Caching:** The system automatically caches DNS/MX records for 24 hours (configurable). Subsequent validations for the same domain are much faster.

2. **Skip SMTP for High-Volume:** If you're validating thousands of emails, consider setting `SKIP_SMTP_VALIDATION=true` to reduce load. You'll lose some accuracy but gain 2-3x speed.

3. **Batch Processing:** Use the batch endpoint instead of looping single validations - it's more efficient.

## 🚨 Troubleshooting

### SMTP Validation Always Returns "unknown"

**Possible causes:**
- SMTP timeout is too low (increase `SMTP_CONNECT_TIMEOUT_MS`)
- Firewall blocking outbound SMTP connections on port 25
- Mail server blocking validation attempts

**Solution:** Check logs for detailed error messages, or temporarily set `SKIP_SMTP_VALIDATION=true`

### DNS Lookups Timing Out

**Possible causes:**
- DNS timeout too low
- Network issues
- DNS server unavailable

**Solution:** Increase `DNS_TIMEOUT_MS` to 5000-10000ms

### High Rate of "accept_all" Results

**Note:** This is normal for certain email providers (e.g., Microsoft Exchange servers often respond positively to all RCPT TO commands). The system correctly flags these as `accept_all` rather than `ok`.

## 📈 Accuracy Comparison

When `SKIP_SMTP_VALIDATION=false`:

| Check Type | Accuracy | Speed |
|-----------|----------|-------|
| **Syntax only** | ~40% | Fast (1ms) |
| **Syntax + DNS** | ~70% | Medium (100ms) |
| **Syntax + DNS + Risk** | ~75% | Medium (100ms) |
| **Full (+ SMTP)** | **~90%** | Slow (2000ms) |

**Recommendation:** Use full validation (SMTP enabled) for critical workflows where deliverability matters. Use DNS-only for high-volume batch processing where speed is prioritized.

## 🔐 Security Notes

- SMTP validation uses `MAIL FROM: null-sender@pivotal-b2b.ai` to minimize spam flag risks
- No actual emails are sent during validation
- All validation is read-only (VRFY/RCPT TO commands only)
- Domain cache uses TTL-based expiration to stay current

## 📝 Next Steps

After testing:

1. Review validation results and adjust configuration if needed
2. Monitor domain cache hit rate (check `/api/test/email-validation/status`)
3. Set up automated validation in your verification campaigns
4. Consider external validation services (EmailListVerify, ZeroBounce) for comparison/validation
