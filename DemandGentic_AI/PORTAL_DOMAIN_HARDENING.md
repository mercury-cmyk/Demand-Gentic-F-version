# Portal Domain Security Hardening

**Objective**: Enforce `https://demandgentic.ai` as the canonical, immutable domain for all client-facing authentication flows (invitations, password resets, notifications) to prevent phishing vulnerabilities from misconfigured environment variables or development URLs.

**Risk Addressed**: 
- Environment variable fallback chains (`CLIENT_PORTAL_BASE_URL || APP_BASE_URL || ...`) could cause non-canonical domains (ngrok URLs, attacker-controlled domains, staging domains) to leak into production emails
- Attackers could exploit misconfigured deployments to phish users with reset links from spoofed domains
- Development URLs (localhost, ngrok tunnels) could accidentally reach production users if environment validation failed

---

## Changes Summary

### 1. Created Canonical Portal URL Helper
**File**: `server/lib/canonical-portal-url.ts` (NEW)

```typescript
export function getCanonicalPortalBaseUrl(requestedBaseUrl?: string | null): string {
  // Always returns 'https://demandgentic.ai'
  // Logs warning if non-canonical URL is requested
  return CANONICAL_PORTAL_BASE_URL;
}

export function buildCanonicalPortalUrl(pathname: string): string {
  // Safely constructs URLs: https://demandgentic.ai{pathname}
  return `${CANONICAL_PORTAL_BASE_URL}${normalizedPath}`;
}
```

**Purpose**: Single source of truth for portal URL construction. All user-facing links now route through this module.

---

### 2. Patched Client Portal Routes
**File**: `server/routes/client-portal.ts`

**Changes**:
- **Line 98**: `PORTAL_BASE_URL = getCanonicalPortalBaseUrl()` (removed env variable fallback)
- **Lines 385-390**: `buildJoinUrl()` now deterministic - always returns `https://demandgentic.ai/client-portal/join/{slug}`
- **Line 4035**: Password reset email link uses `buildCanonicalPortalUrl()` instead of request.hostname fallback

**Impact**: Client invitation links and password reset emails now always use canonical domain.

---

### 3. Patched Mercury Notifications  
**Files**: `server/routes/mercury-bridge.ts`, `server/routes/client-portal-orders.ts`, `server/routes/admin-project-requests.ts`

**Changes**:
- **mercury-bridge.ts line 46**: `DEFAULT_PORTAL_BASE_URL = getCanonicalPortalBaseUrl()` (removed env fallback chain)
- **mercury-bridge.ts line 1123**: Bulk invitation send no longer accepts `req.body.portalBaseUrl` parameter - uses DEFAULT_PORTAL_BASE_URL exclusively
- **client-portal-orders.ts lines 348, 427**: Order approval/rejection notifications use `buildCanonicalPortalUrl()`
- **admin-project-requests.ts lines 530-531**: Campaign approval notifications use `buildCanonicalPortalUrl()`

**Impact**: All Mercury-dispatched transactional emails (order approvals, campaign approvals, invitation confirmations) now contain canonical portal links.

---

### 4. Patched Unified Communications System
**File**: `server/routes/unified-email-system.ts`

**Changes**:
- **Line 28**: `DEFAULT_PORTAL_BASE_URL = getCanonicalPortalBaseUrl()`
- **Lines 171, 175, 189**: Removed `portalBaseUrl: z.string().optional()` from request schemas (sendSingleSchema, resendSingleSchema, previewSchema)
- **Line 228**: Preview endpoint uses `buildCanonicalPortalUrl('/').replace(/\/$/, '')` instead of accepting external portalBaseUrl
- **Line 261**: Send-single endpoint ignores request body portalBaseUrl, uses canonical builder

**Impact**: Bulk invitation preview/send endpoints no longer accept requests to override portal domain.

---

### 5. Patched Password Reset Route
**File**: `server/routes.ts`

**Changes**:
- **Line 153**: Added imports for `buildCanonicalPortalUrl`, `getCanonicalPortalBaseUrl`
- **Lines 1428-1432**: 
  - Client password resets (type='client') use `buildCanonicalPortalUrl()` 
  - Admin resets maintain APP_BASE_URL (different authentication context)

**Impact**: User-initiated password reset emails always link to canonical domain.

---

## Verification Checklist

✅ **Client Portal Invitations**  
- Joining via invitation link always uses: `https://demandgentic.ai/client-portal/join/{slug}`
- Verified in: `client-portal.ts` line 385-390

✅ **Password Reset Flows**  
- Client password reset: `https://demandgentic.ai/reset-password?token={token}&type=client`
- Admin password reset: Uses APP_BASE_URL (separate context)
- Verified in: `client-portal.ts` line 4035, `routes.ts` line 1430

✅ **Order Approval Notifications**  
- Portal link: `https://demandgentic.ai/client-portal/orders/{orderId}`
- Verified in: `client-portal-orders.ts` lines 348, 427

✅ **Campaign Approval Notifications**  
- Portal link: `https://demandgentic.ai/client-portal/campaigns/{campaignId}`
- Verified in: `admin-project-requests.ts` lines 530-531

✅ **Bulk Invitation System**  
- No longer accepts custom portalBaseUrl from request body
- Verified in: `unified-email-system.ts` schemas and `mercury-bridge.ts` line 1123

✅ **Central Notification Service**  
- Mercury bridge uses canonical DEFAULT_PORTAL_BASE_URL
- Verified in: `mercury-bridge.ts` line 46

---

## Security Properties

After these changes, the system guarantees:

1. **Immutability**: Portal domain is a language constant, not configurable at runtime
2. **Completeness**: All client-facing authentication flows use canonical domain
3. **Prevention**: No request parameter or environment variable can override canonical domain
4. **Auditability**: Warning logs if non-canonical URLs are requested (debug visibility)
5. **Email Safety**: All transactional emails (password resets, order approvals, campaign approvals, invitations) contain canonical links

---

## Files Modified

| File | Lines Changed | Change Type |
|------|---------------|------------|
| `server/lib/canonical-portal-url.ts` | NEW | Helper module creation |
| `server/routes/client-portal.ts` | 98, 385-390, 4035 | Imports + 3 location patches |
| `server/routes/mercury-bridge.ts` | 35-46, 1123 | Import + 2 location patches |
| `server/routes/client-portal-orders.ts` | 14, 348, 427 | Import + 2 location patches |
| `server/routes/admin-project-requests.ts` | 15, 530-531 | Import + 1 location patch |
| `server/routes/unified-email-system.ts` | 7, 28, 171, 175, 189, 228, 261 | Import + schema + 2 location patches |
| `server/routes.ts` | 153, 1428-1432 | Import + 1 location patch |

**Total**: 1 new file + 7 modified files, all authentication flows secured.

---

## Testing Recommendations

1. **Client Invitation Flow**: Create client user, generate invitation, verify email contains `https://demandgentic.ai/client-portal/join/...`
2. **Password Reset**: Trigger password reset, verify email contains `https://demandgentic.ai/reset-password?token=...`
3. **Order Notifications**: Create order, approve it, verify email notification contains `https://demandgentic.ai/client-portal/orders/...`
4. **Campaign Approvals**: Submit campaign request, approve it, verify email contains `https://demandgentic.ai/client-portal/campaigns/...`
5. **Bulk Invitations**: Execute bulk invite with non-canonical portalBaseUrl in request body, verify it's ignored (uses canonical domain)
6. **Environment Override Test**: Set `CLIENT_PORTAL_BASE_URL=https://attacker.com` in environment, verify invitations still use canonical domain

---

## Remaining Considerations

**Out of Scope** (different risk models):
- `APP_BASE_URL` for OAuth callbacks and admin links (separate authentication context)
- Unsubscribe/view-in-browser URLs for email campaigns (app domain, not portal)
- SMTP provider OAuth redirects (internal service, not client-facing)

**Future Hardening** (optional follow-up):
- Validate `CLIENT_PORTAL_BASE_URL` environment variable at startup (reject if non-canonical)
- Pin canonical domain in TypeScript type system to prevent reassignment
- Add HTTP security headers (HSTS, CSP) to prevent redirect attacks
- Monitor logs for non-canonical portal domain requests (anomaly detection)