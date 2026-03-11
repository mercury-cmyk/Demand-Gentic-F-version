---
description: "Run a comprehensive AgentC security audit on specified files or features — OWASP Top 10, auth flows, data validation, secrets exposure."
agent: "orchestrator"
tools: [read, search]
argument-hint: "Which files or features to audit..."
---

Perform a comprehensive AgentC security audit using the full OWASP Top 10 framework. Be adversarial — assume code is insecure until proven otherwise.

## Audit Scope
Audit the specified files/features across all 10 OWASP categories:

### 1. Access Control
- Auth middleware present on every protected route.
- Resource ownership verified (not just authentication).
- Role-based access enforced (admin vs portal vs public).
- IDOR checks: IDs in params validated against user scope.

### 2. Cryptographic Safety
- No secrets in logs, error responses, or client bundles.
- Token comparison uses `crypto.timingSafeEqual`.
- Passwords hashed with bcrypt/scrypt (sufficient rounds).

### 3. Injection Prevention
- SQL: All queries use Drizzle parameterized queries. No string concat.
- XSS: No `dangerouslySetInnerHTML`, no unsanitized URL injection.
- Command: No `exec()`/`eval()` with user-influenced input.

### 4. Design Security
- Rate limiting on auth, password reset, expensive operations.
- Zod validation at every API boundary.
- Mass assignment protection (whitelist accepted fields).

### 5. Configuration
- CORS uses explicit origin allowlists (not `*` in production).
- Error responses don't expose stack traces or internal paths.
- Security headers set (`X-Content-Type-Options`, `X-Frame-Options`, `HSTS`).

### 6. Component Vulnerabilities
- Flag dependencies with known CVEs.
- Flag unmaintained packages.

### 7. Auth & Sessions
- Token expiry enforced.
- Dual-auth preserved (`authToken` vs `clientPortalToken`).
- Session invalidation on credential change.

### 8. Data Integrity
- Webhook signatures validated before processing.
- CSRF protection on state-changing endpoints.
- Event ID deduplication for webhooks.

### 9. Logging
- No PII/secrets in logs.
- Auth failures and access denials logged.

### 10. SSRF
- User-supplied URLs validated against allowlist.
- Private IP ranges blocked in outbound requests.

## Output
Report all findings by severity: **CRITICAL → HIGH → MEDIUM → LOW** with file:line references and specific fix code for CRITICAL/HIGH items.
