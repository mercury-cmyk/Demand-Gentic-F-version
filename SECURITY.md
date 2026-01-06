# Enterprise Security Implementation Guide

## Overview
This document describes the security features implemented in Pivotal CRM to protect sensitive data, prevent attacks, and ensure compliance with industry standards.

---

## 🛡️ Security Features Implemented

### 1. Rate Limiting (防止暴力攻击 Anti-Brute Force)

**Purpose**: Prevent brute force attacks, API abuse, and DOS attacks

**Implemented Limiters**:

| Limiter Type | Endpoints | Limit | Window | Purpose |
|--------------|-----------|-------|---------|---------|
| **Auth Limiter** | `/api/auth/login` | 5 requests | 15 min | Prevent brute force login attacks |
| **API Limiter** | All `/api/*` routes | 100 requests | 15 min | General API abuse prevention |
| **Write Limiter** | POST/PUT/DELETE operations | 30 requests | 10 min | Prevent excessive write operations |
| **Expensive Limiter** | Exports, bulk operations | 5 requests | 1 hour | Protect resource-intensive operations |

**Benefits**:
- ✅ Stops credential stuffing attacks on login
- ✅ Prevents API scraping and data exfiltration
- ✅ Protects server resources from abuse
- ✅ Returns standard HTTP 429 "Too Many Requests" with retry-after headers

**Example Response**:
```json
{
  "message": "Too many login attempts, please try again after 15 minutes."
}
```

---

### 2. Request Validation with Zod Schemas

**Purpose**: Prevent injection attacks (SQL, XSS, code injection) and ensure data integrity

**Validation Coverage**:
- ✅ **Authentication**: Username/password validation, email format
- ✅ **User Management**: Create/update users, role assignments
- ✅ **UUID Validation**: All entity IDs validated as proper UUIDs
- ✅ **Data Types**: Strong typing on all inputs (strings, numbers, emails, dates)
- ✅ **Field Lengths**: Prevent buffer overflow attacks with max lengths
- ✅ **Enum Validation**: Ensure only valid values for roles, statuses, types

**Example Protected Endpoint**:
```typescript
// Before: Vulnerable to injection
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body; // No validation!
});

// After: Secure with validation
app.post("/api/auth/login", authLimiter, validate({ body: loginSchema }), async (req, res) => {
  const { username, password } = req.body; // Validated by Zod schema
});
```

**Validation Error Response**:
```json
{
  "message": "Validation failed",
  "errors": [
    {
      "field": "username",
      "message": "Username must be at least 3 characters"
    }
  ]
}
```

---

### 3. Security Headers

**Purpose**: Protect against clickjacking, MIME sniffing, XSS, and other client-side attacks

**Headers Applied to All Responses**:

| Header | Value | Protection |
|--------|-------|------------|
| `X-Frame-Options` | `DENY` | Prevents clickjacking by blocking iframe embedding |
| `X-Content-Type-Options` | `nosniff` | Stops MIME type sniffing attacks |
| `X-XSS-Protection` | `1; mode=block` | Enables browser XSS filter |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information leakage |
| `Content-Security-Policy` | Restrictive policy | Prevents unauthorized script execution |

**Content Security Policy**:
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self'
```

---

### 4. Payload Size Limits

**Purpose**: Prevent Denial of Service (DOS) attacks via large payloads

**Limits Set**:
- **JSON Requests**: 10 MB (down from vulnerable 50GB!)
- **URL Encoded Data**: 10 MB
- **File Uploads**: 50 MB

**Why This Matters**:
- ❌ **Before**: Attackers could send 50GB payloads to crash the server
- ✅ **After**: Oversized payloads rejected immediately with 413 error

---

### 5. Input Sanitization

**Purpose**: Remove potentially malicious content from user inputs

**Sanitization Rules**:
- ✅ Strip HTML tags to prevent XSS attacks
- ✅ Remove SQL injection patterns (SELECT, DROP, INSERT, etc.)
- ✅ Remove comment markers (--,  #, /* */) used in SQL injection
- ✅ Trim whitespace to normalize inputs

**Sanitization Middleware**:
Applied automatically to all request bodies before processing

---

### 6. Client IP Tracking

**Purpose**: Enable security auditing and forensic analysis

**Features**:
- Captures real client IP (considers X-Forwarded-For, X-Real-IP headers)
- Handles proxy scenarios correctly
- Attaches IP to request object for logging
- Enables IP-based blocking and rate limiting

**Use Cases**:
- 🔍 Audit logs: "Who accessed this sensitive data?"
- 🚨 Incident response: "What IP launched the attack?"
- 🚫 IP blocking: "Block this malicious IP range"

---

## 🔐 Secrets Management

### Current Secrets in Use

| Secret Name | Purpose | Required |
|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ Yes |
| `JWT_SECRET` | JSON Web Token signing key | ✅ Yes |
| `TELNYX_API_KEY` | Telnyx API authentication | ✅ Yes (for calling) |
| `TELNYX_SIP_USERNAME` | SIP trunk username | ✅ Yes (for calling) |
| `TELNYX_SIP_PASSWORD` | SIP trunk password | ✅ Yes (for calling) |
| `ASSEMBLYAI_API_KEY` | AssemblyAI transcription | ✅ Yes (for call QA) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI/Replit AI key | ✅ Yes (for AI analysis) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | AI service endpoint | ✅ Yes (for AI analysis) |
| `RESOURCES_CENTRE_URL` | External resources API URL | Optional |
| `RESOURCES_CENTRE_API_KEY` | External resources API key | Optional |
| `PUSH_SECRET_KEY` | Inter-service authentication | Optional |

### ✅ Best Practices for Secrets

1. **Use Replit Secrets** (Already Available)
   - Store all secrets in Replit's Secrets tab (not in code or .env files)
   - Secrets are encrypted at rest
   - Automatically injected as environment variables
   - Never committed to version control

2. **Least Privilege**
   - Only grant access to secrets that are actually needed
   - Use separate keys for dev/staging/production environments

3. **Rotation Schedule**
   - Rotate JWT_SECRET every 90 days
   - Rotate API keys annually or after team member departure
   - Use version suffixes (e.g., `JWT_SECRET_V2`) during rotation

4. **Audit Access**
   - Review who has access to secrets quarterly
   - Remove access for departed team members immediately
   - Log secret access in production environments

---

## 🚨 Security Monitoring & Incident Response

### What to Monitor

1. **Failed Login Attempts**
   - Multiple failures from same IP = potential brute force
   - Alert threshold: 3 failures within 5 minutes

2. **Rate Limit Violations**
   - Repeated 429 errors = API abuse or scraping
   - Alert threshold: 5 violations within 1 hour

3. **Unusual Data Access Patterns**
   - Bulk exports outside business hours
   - Access to sensitive data from new IPs
   - Excessive queries from single user

4. **Validation Failures**
   - Repeated validation errors = injection attempts
   - Alert threshold: 10 failures within 10 minutes

### Incident Response Procedure

**1. Detection** (0-15 minutes)
- Alert triggered by monitoring system
- Security team notified via Slack/email

**2. Assessment** (15-30 minutes)
- Review audit logs to identify scope
- Determine if it's an attack or false positive
- Classify severity: Low, Medium, High, Critical

**3. Containment** (30-60 minutes)
- Block malicious IPs at firewall level
- Temporarily disable compromised user accounts
- Increase rate limits if needed

**4. Eradication** (1-4 hours)
- Remove attacker access
- Patch vulnerabilities
- Reset compromised credentials

**5. Recovery** (4-24 hours)
- Restore normal operations
- Monitor for repeat attacks
- Verify data integrity

**6. Post-Incident** (1-7 days)
- Document lessons learned
- Update security policies
- Implement additional controls

---

## 📋 Security Checklist for Deployment

### Before Going to Production

- [ ] **Secrets Management**
  - [ ] All secrets stored in Replit Secrets (not in code)
  - [ ] Strong JWT_SECRET (min 32 random characters)
  - [ ] API keys rotated from development keys

- [ ] **Rate Limiting**
  - [ ] Verify rate limits are active on all endpoints
  - [ ] Test that limits trigger correctly
  - [ ] Configure monitoring alerts for limit violations

- [ ] **Input Validation**
  - [ ] All user inputs validated with Zod schemas
  - [ ] File upload size limits enforced
  - [ ] SQL injection patterns tested

- [ ] **Security Headers**
  - [ ] Test CSP doesn't block legitimate functionality
  - [ ] Verify X-Frame-Options prevents clickjacking
  - [ ] Check HTTPS redirect works

- [ ] **Monitoring & Logging**
  - [ ] Audit logging enabled for sensitive operations
  - [ ] Security event alerts configured
  - [ ] Log retention policy defined (90 days minimum)

- [ ] **Access Control**
  - [ ] RBAC policies tested for all roles
  - [ ] Admin accounts use strong passwords + MFA (when implemented)
  - [ ] Service accounts have minimal privileges

- [ ] **Data Protection**
  - [ ] Sensitive data encrypted at rest (implement in Phase 2)
  - [ ] TLS 1.3 enforced for all connections
  - [ ] Database backups tested and encrypted

---

## 🎯 Next Security Enhancements (Roadmap)

### Phase 2: Authentication Hardening (2-3 weeks)
- [ ] Multi-Factor Authentication (TOTP/SMS)
- [ ] Password complexity requirements
- [ ] Account lockout after failed attempts
- [ ] OAuth2/OIDC integration for SSO

### Phase 3: Data Protection (2-3 weeks)
- [ ] Encryption at rest for PII (emails, phones, names)
- [ ] Per-tenant encryption keys
- [ ] Database connection encryption
- [ ] Secure key management (AWS KMS/HashiCorp Vault)

### Phase 4: Compliance & Audit (3-4 weeks)
- [ ] Comprehensive audit logging system
- [ ] GDPR data export/deletion automation
- [ ] CCPA compliance features
- [ ] SOC 2 audit trail preparation

### Phase 5: Advanced Monitoring (2-3 weeks)
- [ ] Security Information and Event Management (SIEM)
- [ ] Real-time anomaly detection
- [ ] Automated incident response
- [ ] Penetration testing program

---

## 📚 Additional Resources

- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **NIST Cybersecurity Framework**: https://www.nist.gov/cyberframework
- **CIS Controls**: https://www.cisecurity.org/controls
- **GDPR Compliance**: https://gdpr.eu/
- **CCPA Compliance**: https://oag.ca.gov/privacy/ccpa

---

## 🆘 Security Contacts

**Report Security Issues**:
- Email: security@pivotalcrm.com (configure this!)
- Slack: #security channel
- Emergency: 24/7 on-call rotation

**Responsible Disclosure**:
We appreciate responsible disclosure of security vulnerabilities. Please report issues privately before public disclosure.

---

*Last Updated: October 19, 2025*
*Version: 1.0*
