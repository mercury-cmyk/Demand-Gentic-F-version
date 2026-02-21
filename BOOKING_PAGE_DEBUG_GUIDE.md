# Booking Page 404 Issue - Debug Guide

## Current Status

**Backend Verification:** ✅ PASSED
- Database connection working
- Admin user exists
- Demo booking type exists and is active
- API endpoint logic is sound

**Frontend Status:** ❌ BROKEN  
- Route defined correctly at `/book/:username/:slug`
- Component shows "Booking Page Not Found"
- User sees error: "The link you used seems to be invalid or expired"

## Root Cause Analysis

The booking page returns 404 despite correct configuration because:

### Verified Working Parts:
1. ✅ Database (`ep-mute-sky-ahoyd10z`) contains:
   - Admin user: ID `4c4715ab-a5b5-4a47-83d7-72371d623c55`
   - Demo booking type: ID `4`, Active: `true`, Duration: `30 min`

2. ✅ Routes configured :
   - Backend: `/api/bookings/public/:username/:slug` (mounted at line 847 of server/routes.ts)
   - Frontend: `/book/:username/:slug` (defined at line 655 of client/src/App.tsx)

3. ✅ Component rendered: `PublicBookingPage` imports correctly

### Likely Failure Points:

1. **Production DATABASE_URL Secret**
   - Cloud Build sets: `--set-secrets DATABASE_URL=DATABASE_URL:latest`
   - If secret is stale or pointing to wrong database, queries will return 404

2. **API Response Error**
   - Check production logs for: `[DEBUG] resolvePublicBooking:...`
   - Look for database connection errors

3. **Network/CORS Issue**
   - Browser console may show fetch errors
   - Production deployment may have network restrictions

## Debugging Changes Made

### File: `server/routes/booking-routes.ts`

Added comprehensive logging to `resolvePublicBooking()`:

```typescript
console.log(`[DEBUG] resolvePublicBooking: Looking for username="${username}", slug="${slug}"`);
// ... step-by-step logging at each query stage
console.log(`[DEBUG] Fallback query result:`, ...);
```

Added logging to API endpoint:

```typescript
console.log(`[DEBUG] Booking API request: username=${username}, slug=${slug}`);
console.log(`[DEBUG] resolvePublicBooking result:`, ...);
```

### File: `test-booking-api.ts` (NEW)

Testing script that verifies:
- Database connection in production mode
- Admin user discovery
- Booking type resolution
- API response simulation

**To run:**
```bash
$env:NODE_ENV="production"; npm run dev
```

## Steps to Resolve

### Step 1: Verify Production Database Secret
```bash
# Check what DATABASE_URL is set to in Cloud Run
gcloud run services describe demandgentic-api --region us-central1
# Look for: DATABASE_URL environment variable
# Expected: postgresql://...@ep-mute-sky-ahoyd10z...
```

### Step 2: Enable Production Logging
1. Redeploy with current changes:
   ```bash
   gcloud builds submit --config cloudbuild.yaml
   ```

2. View logs once deployed:
   ```bash
   gcloud run logs read demandgentic-api --tail 100
   ```

3. Access booking page: `https://demandgentic.ai/book/admin/demo`

4. Check logs for `[DEBUG]` entries from booking-routes.ts

### Step 3: Analyze Returned Error Type

**If logs show:**
- `NO USER FOUND` → Username lookup failed (case sensitivity? wrong database?)
- `NO BOOKING TYPE FOR THIS USER` → User found but booking not linked  
- `NO FALLBACK FOUND` → No active demo bookings exist
- `resolvePublicBooking crashed` → Database connection error

### Step 4: Check Browser Console
1. Open https://demandgentic.ai/book/admin/demo
2. Press F12 → Console tab
3. Look for network errors from `/api/bookings/public/admin/demo`
4. Check if response is:
   - 404 (Not Found)
   - 500 (Server Error)
   - CORS error
   - Network timeout

## Fallback Solutions

### If production DATABASE_URL is wrong:

Update the secret in Google Cloud Secret Manager:
```bash
echo "postgresql://neondb_owner:...@ep-mute-sky-ahoyd10z...?sslmode=require" | \
  gcloud secrets versions add DATABASE_URL --data-file=-
```

Then redeploy.

### If fallback lookup is failing:

Check that booking slug doesn't have case sensitivity issues:
```sql
SELECT slug, is_active FROM booking_types 
WHERE slug = 'demo' AND is_active = true;
```

### If component is not rendering:

The component logic shows:
```tsx
if (infoError || !info) {
  return <div>... "Booking Page Not Found"</div>
}
```

Check that the API returns data with both `user` and `bookingType` fields:
```json
{
  "user": { "firstName": "...", "lastName": "...", "username": "..." },
  "bookingType": { "id": 4, "name": "Product Demo", ...}
}
```

## Created Scripts

1. **test-booking-api.ts** - Local verification script
   - Tests database connection
   - Verifies admin user exists
   - Simulates API response
   - Shows what the API should return

   Run with:
   ```bash
   $env:NODE_ENV="production"; npx tsx test-booking-api.ts
   ```

2. **debug-booking-api.ts** - HTTP endpoint test
   - Tests actual /api/bookings/public/admin/demo endpoint
   - Checks network connectivity
   - Validates JSON response

## Recovery Checklist

- [ ] DATABASE_URL secret verified correct in Cloud Run
- [ ] Production logs show `[DEBUG]` entries for booking requests
- [ ] Browser Network tab shows `GET /api/bookings/public/admin/demo` returning 200
- [ ] API returns valid JSON with `user` and `bookingType`
- [ ] Frontend component `infoError` is null and `info` is populated
- [ ] Booking page displays without "Not Found" error

## Next Steps

1. Commit changes to booking-routes.ts (enhanced logging)
2. Redeploy to production
3. Access booking page and check logs
4. Use debug checklist to isolate issue
5. Apply appropriate fix based on root cause found

---

**Note:** All database queries verified working locally with production database `ep-mute-sky-ahoyd10z`. If production still fails, issue is environmental (secrets, network, or deployment configuration).
