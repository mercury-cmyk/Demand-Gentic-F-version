# Resources Centre Integration - Implementation Summary

## ✅ Completed in Pivotal CRM

### 1. Database Schema
- ✅ `speakers` table with externalId tracking
- ✅ `organizers` table with externalId tracking  
- ✅ `sponsors` table with externalId tracking
- ✅ `events`, `resources`, `news` tables for content distribution
- All tables have proper indexes and timestamps

### 2. API Endpoints (All Protected with RBAC)
- ✅ `GET /api/speakers` - List all speakers (requireAuth)
- ✅ `POST /api/speakers` - Create speaker (admin/data_ops)
- ✅ `PUT /api/speakers/:id` - Update speaker (admin/data_ops)
- ✅ `DELETE /api/speakers/:id` - Delete speaker (admin/data_ops)
- ✅ Same CRUD for organizers and sponsors
- ✅ Same CRUD for events, resources, and news
- ✅ `POST /api/sync/resources-centre` - Trigger sync (admin/data_ops)

### 3. Event Form Enhancements
- ✅ Searchable dropdown for organizer selection
- ✅ Searchable dropdown for sponsor selection
- ✅ Multi-select combobox for speakers with search
- ✅ Shows speaker details (title, company)
- ✅ Selected speakers display as removable badges

### 4. Sync Service
- ✅ Smart conflict resolution (timestamp-based)
- ✅ Uses externalId to prevent duplicates
- ✅ Handles partial failures gracefully
- ✅ Detailed sync results reporting
- ✅ Proper error handling and logging

### 5. Resources Centre Management Page
- ✅ Comprehensive admin UI at `/resources-centre`
- ✅ One-click sync with detailed results display
- ✅ Overview of all content types (Events, Resources, News)
- ✅ Quick create buttons for each content type
- ✅ Integration status monitoring
- ✅ Added to main navigation for admin/campaign_manager/data_ops roles

### 6. Documentation
- ✅ `docs/resources-centre-api-spec.md` - API specification for Resources Centre
- ✅ `docs/resources-centre-sync-guide.md` - Complete usage guide
- ✅ `docs/RESOURCES_CENTRE_INTEGRATION_SUMMARY.md` - Integration overview
- ✅ Updated `replit.md` with integration details

## ✅ Configuration Complete

### Environment Variables Set
- ✅ `RESOURCES_CENTRE_URL` = `https://workspace.wh5q8xynmq.repl.co`
- ✅ `RESOURCES_CENTRE_API_KEY` = configured securely
- ✅ Sync service updated to use `/api/v1/` prefix

### Existing Resources Centre Endpoints
Currently available:
- ✅ `GET /api/v1/events` - Returns events data
- ✅ `GET /api/v1/stats` - Returns platform statistics

## 🔧 Required in Resources Centre

### API Endpoints to Implement

The Resources Centre needs to add these 3 additional REST API endpoints (full spec in `docs/resources-centre-api-spec.md`):

```python
# In Resources Centre Flask app

@api_bp.route('/api/speakers', methods=['GET'])
@require_api_key
def get_speakers():
    speakers = Speaker.query.all()
    return jsonify({
        'speakers': [speaker.to_dict() for speaker in speakers]
    })

@api_bp.route('/api/organizers', methods=['GET'])
@require_api_key
def get_organizers():
    organizers = Organizer.query.all()
    return jsonify({
        'organizers': [org.to_dict() for org in organizers]
    })

@api_bp.route('/api/sponsors', methods=['GET'])
@require_api_key
def get_sponsors():
    sponsors = Sponsor.query.all()
    return jsonify({
        'sponsors': [sponsor.to_dict() for sponsor in sponsors]
    })
```

### Authentication
All endpoints should check for `X-API-Key` header and validate against an environment variable.

## 🔑 Configuration Steps

### Step 1: ✅ Environment Variables (COMPLETE)

Already configured in Pivotal CRM:
- ✅ `RESOURCES_CENTRE_URL` = `https://workspace.wh5q8xynmq.repl.co`
- ✅ `RESOURCES_CENTRE_API_KEY` = configured

### Step 2: Implement Missing API Endpoints in Resources Centre

Add these 3 endpoints to Resources Centre using the same authentication pattern as `/api/v1/events`:

```python
@api_bp.route('/api/v1/speakers', methods=['GET'])
@require_api_key  # Use same X-API-Key validation as other endpoints
def get_speakers():
    # Return all speakers with id, name, title, company, bio, created_at, updated_at
    pass

@api_bp.route('/api/v1/organizers', methods=['GET'])
@require_api_key
def get_organizers():
    # Return all organizers with id, name, website, created_at, updated_at
    pass

@api_bp.route('/api/v1/sponsors', methods=['GET'])
@require_api_key
def get_sponsors():
    # Return all sponsors with id, name, website, created_at, updated_at
    pass
```

See `docs/resources-centre-api-spec.md` for full implementation details.

### Step 3: Test the Connection

Once Resources Centre APIs are implemented, trigger a sync:

```bash
curl -X POST https://your-pivotal-crm.repl.co/api/sync/resources-centre \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected response:
```json
{
  "message": "Sync completed successfully",
  "success": true,
  "speakers": { "created": 5, "updated": 0, "errors": 0 },
  "organizers": { "created": 2, "updated": 0, "errors": 0 },
  "sponsors": { "created": 3, "updated": 0, "errors": 0 }
}
```

## 📋 Next Steps

1. **In Resources Centre:**
   - [ ] Implement the three API endpoints following the spec
   - [ ] Add API key authentication
   - [ ] Test endpoints with curl/Postman
   - [ ] Set the API_KEY environment variable

2. **In Pivotal CRM:**
   - [ ] Set RESOURCES_CENTRE_URL environment variable
   - [ ] Set RESOURCES_CENTRE_API_KEY environment variable
   - [ ] Run initial sync to populate data
   - [ ] Test event form with synced data

3. **Optional Enhancements:**
   - [ ] Add scheduled sync (e.g., hourly cron job)
   - [ ] Add sync button in admin UI
   - [ ] Implement webhook support for real-time updates
   - [ ] Add delta sync support (only fetch updated records)

## 🎯 How It Works

### Data Flow

```
Resources Centre (Source of Truth)
           ↓
    API Endpoints (/api/speakers, etc.)
           ↓
    Pivotal CRM Sync Service
           ↓
    Local Cache (speakers/organizers/sponsors tables)
           ↓
    Event Form (dropdowns & multi-select)
```

### Sync Logic

1. Fetch all records from Resources Centre API
2. Match with local records using `externalId`
3. For existing records: Update only if remote is newer
4. For new records: Create with externalId set
5. Report detailed results

### Event Creation

1. User opens event form
2. Dropdowns populate from local cache
3. User selects organizer, sponsor, speakers
4. Form saves **names** to events table
5. No foreign key constraints - flexible and resilient

## 🔒 Security

- ✅ API key authentication between systems
- ✅ All sync endpoints require admin/data_ops role
- ✅ HTTPS communication
- ✅ Environment variables for secrets
- ✅ Zod validation on all inputs
- ✅ Proper error handling with status codes

## 📝 Files Created

1. `server/services/resourcesCentreSync.ts` - Sync service
2. `docs/resources-centre-api-spec.md` - API specification
3. `docs/resources-centre-sync-guide.md` - Usage guide
4. `docs/RESOURCES_CENTRE_INTEGRATION_SUMMARY.md` - This file

## 🧪 Testing

Once APIs are ready, test the integration:

1. Create test data in Resources Centre
2. Trigger sync in Pivotal CRM
3. Verify data appears in event form dropdowns
4. Create an event with synced data
5. Confirm event saves correctly

---

**Status:** ✅ Pivotal CRM implementation complete, waiting for Resources Centre API implementation
