# Resources Centre Sync Guide

This guide explains how to sync speakers, organizers, and sponsors data from the Resources Centre to Pivotal CRM.

## Prerequisites

### 1. Resources Centre API Implementation

The Resources Centre must implement the following API endpoints as specified in `docs/resources-centre-api-spec.md`:

- `GET /api/speakers` - Returns all speakers
- `GET /api/organizers` - Returns all organizers
- `GET /api/sponsors` - Returns all sponsors

All endpoints must accept an `X-API-Key` header for authentication.

### 2. Environment Variables

Set the following environment variables in Pivotal CRM:

```bash
RESOURCES_CENTRE_URL=https://workspace.wh5q8xynmq.repl.co
RESOURCES_CENTRE_API_KEY=your-api-key-here
```

**To add these in Replit:**
1. Go to the Secrets tab (lock icon in left sidebar)
2. Add `RESOURCES_CENTRE_URL` with value: `https://workspace.wh5q8xynmq.repl.co`
3. Add `RESOURCES_CENTRE_API_KEY` with the API key from Resources Centre

## Manual Sync

### Using API Endpoint

Trigger a manual sync by calling the sync endpoint:

```bash
POST /api/sync/resources-centre
Authorization: Bearer <jwt-token>
```

**Requirements:**
- User must be authenticated
- User must have `admin` or `data_ops` role

**Example with curl:**
```bash
curl -X POST https://your-pivotal-crm.repl.co/api/sync/resources-centre \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### Response Format

**Success (200 OK):**
```json
{
  "message": "Sync completed successfully",
  "success": true,
  "speakers": {
    "created": 5,
    "updated": 3,
    "errors": 0
  },
  "organizers": {
    "created": 2,
    "updated": 1,
    "errors": 0
  },
  "sponsors": {
    "created": 4,
    "updated": 2,
    "errors": 0
  }
}
```

**Partial Success (207 Multi-Status):**
```json
{
  "message": "Sync completed with errors",
  "success": false,
  "speakers": {
    "created": 5,
    "updated": 3,
    "errors": 0
  },
  "organizers": {
    "created": 0,
    "updated": 0,
    "errors": 1
  },
  "errors": [
    "Organizers sync failed: Resources Centre API error: 500 Internal Server Error"
  ]
}
```

**Configuration Error (400 Bad Request):**
```json
{
  "message": "Configuration error",
  "error": "RESOURCES_CENTRE_URL environment variable is not set"
}
```

**Authentication Error (401 Unauthorized):**
```json
{
  "message": "Authentication failed with Resources Centre",
  "error": "Invalid API key for Resources Centre"
}
```

## How Sync Works

### Data Mapping

The sync service uses the `externalId` field to track which local records correspond to Resources Centre records:

- **Speakers:** `externalId` stores the Resources Centre speaker ID
- **Organizers:** `externalId` stores the Resources Centre organizer ID
- **Sponsors:** `externalId` stores the Resources Centre sponsor ID

### Sync Logic

For each resource type (speakers/organizers/sponsors):

1. **Fetch** all records from Resources Centre API
2. **Match** Resources Centre records to local records using `externalId`
3. **For existing records:**
   - Compare `updated_at` timestamps
   - Update local record only if Resources Centre version is newer
4. **For new records:**
   - Create new local record with `externalId` set to Resources Centre ID

### Conflict Resolution

- **Last Write Wins:** The most recently updated record (based on `updated_at`) takes precedence
- **No Deletes:** Sync does not delete local records if they're removed from Resources Centre
- **Error Handling:** If one resource type fails to sync, others continue processing

## Event Form Integration

After syncing, the event form automatically displays:

- **Organizers dropdown:** Shows all synced organizers
- **Sponsors dropdown:** Shows all synced sponsors
- **Speakers multi-select:** Shows all synced speakers with their title and company

The form stores the **name** of the selected organizer/sponsor and an **array of speaker names** in the events table.

## Troubleshooting

### "Configuration error" message

**Problem:** Environment variables not set

**Solution:**
1. Go to Replit Secrets tab
2. Ensure both `RESOURCES_CENTRE_URL` and `RESOURCES_CENTRE_API_KEY` are set
3. Restart the application

### "Authentication failed with Resources Centre"

**Problem:** Invalid or incorrect API key

**Solution:**
1. Verify the API key is correct in Resources Centre
2. Update `RESOURCES_CENTRE_API_KEY` in Replit Secrets
3. Restart the application

### "Resources Centre API error: 404"

**Problem:** API endpoints not implemented in Resources Centre

**Solution:**
1. Implement the required API endpoints in Resources Centre following `docs/resources-centre-api-spec.md`
2. Ensure endpoints return JSON in the correct format

### Partial sync success

**Problem:** Some resources sync successfully, others fail

**Solution:**
1. Check the `errors` array in the response
2. Fix the specific resource type that's failing
3. Run sync again - already synced records won't be duplicated

## Future Enhancements

Potential improvements to the sync system:

1. **Scheduled Sync:** Automatically sync at regular intervals (e.g., hourly)
2. **Webhook Support:** Real-time updates when Resources Centre data changes
3. **Delta Sync:** Only fetch records updated since last sync (requires Resources Centre API support)
4. **Sync History:** Track sync operations in the database
5. **Admin UI:** Add sync button in the admin interface
6. **Bi-directional Sync:** Push changes from Pivotal CRM to Resources Centre

## Security Considerations

- API key is stored as an environment variable (never in code)
- Sync endpoint requires authentication and role-based access control
- All communication with Resources Centre uses HTTPS
- externalId prevents duplicate records during repeated syncs
