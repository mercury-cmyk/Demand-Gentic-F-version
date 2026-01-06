# Resources Centre API Implementation Required

## Status

**Pivotal CRM is 100% ready** to sync data from the Resources Centre, but the **Resources Centre API endpoints are not implemented yet**.

## Current Situation

### ✅ Completed in Pivotal CRM
- Sync service fully implemented with smart conflict resolution
- Database tables created (speakers, organizers, sponsors)
- Admin UI at `/resources-centre` with sync functionality
- All CRUD APIs for managing synced data
- Event form integration with dropdowns and multi-select
- Environment variables configured:
  - `RESOURCES_CENTRE_URL`: https://tech-event-hub-wh5q8xynmq.replit.app
  - `RESOURCES_CENTRE_API_KEY`: pivotal_KtFoTEP2cRnOt6idBlcjIg4Cx1m7Mg04VINjMOeHn10

### ❌ Missing in Resources Centre
The Resources Centre needs to implement three API endpoints that return JSON data:

1. `GET /api/v1/speakers` - Currently returns 404
2. `GET /api/v1/organizers` - Currently returns 404  
3. `GET /api/v1/sponsors` - Currently returns 404

## What Needs to Be Implemented

### 1. Authentication Middleware
All three endpoints must validate the API key:

```python
# Example authentication check
def validate_api_key(request):
    api_key = request.headers.get('X-API-Key')
    expected_key = os.getenv('PIVOTAL_API_KEY')  # Store the key in env
    
    if not api_key or api_key != expected_key:
        return jsonify({"error": "Unauthorized"}), 401
```

### 2. GET /api/v1/speakers
**Endpoint:** `GET /api/v1/speakers`

**Headers Required:**
```
X-API-Key: pivotal_KtFoTEP2cRnOt6idBlcjIg4Cx1m7Mg04VINjMOeHn10
```

**Response Format:**
```json
{
  "speakers": [
    {
      "id": 1,
      "name": "Dr. Jane Smith",
      "title": "Chief Data Officer",
      "company": "TechCorp",
      "bio": "AI and data science expert with 15 years of experience",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": 2,
      "name": "John Doe",
      "title": "VP of Engineering",
      "company": "InnovateCo",
      "bio": "Cloud architecture specialist",
      "created_at": "2024-01-16T14:20:00Z",
      "updated_at": "2024-01-16T14:20:00Z"
    }
  ]
}
```

### 3. GET /api/v1/organizers
**Endpoint:** `GET /api/v1/organizers`

**Headers Required:**
```
X-API-Key: pivotal_KtFoTEP2cRnOt6idBlcjIg4Cx1m7Mg04VINjMOeHn10
```

**Response Format:**
```json
{
  "organizers": [
    {
      "id": 1,
      "name": "Innovation Summit",
      "website": "https://innovationsummit.com",
      "description": "Leading tech conference organizer",
      "created_at": "2024-01-10T09:00:00Z",
      "updated_at": "2024-01-10T09:00:00Z"
    },
    {
      "id": 2,
      "name": "TechEvents Global",
      "website": "https://techevents.global",
      "description": "International event management company",
      "created_at": "2024-01-12T11:30:00Z",
      "updated_at": "2024-01-12T11:30:00Z"
    }
  ]
}
```

### 4. GET /api/v1/sponsors
**Endpoint:** `GET /api/v1/sponsors`

**Headers Required:**
```
X-API-Key: pivotal_KtFoTEP2cRnOt6idBlcjIg4Cx1m7Mg04VINjMOeHn10
```

**Response Format:**
```json
{
  "sponsors": [
    {
      "id": 1,
      "name": "Microsoft",
      "tier": "platinum",
      "website": "https://microsoft.com",
      "logo_url": "https://example.com/logos/microsoft.png",
      "created_at": "2024-01-05T08:00:00Z",
      "updated_at": "2024-01-05T08:00:00Z"
    },
    {
      "id": 2,
      "name": "AWS",
      "tier": "gold",
      "website": "https://aws.amazon.com",
      "logo_url": "https://example.com/logos/aws.png",
      "created_at": "2024-01-07T10:15:00Z",
      "updated_at": "2024-01-07T10:15:00Z"
    }
  ]
}
```

## Required Field Specifications

### Speakers Fields
- `id` (integer, required): Unique identifier
- `name` (string, required): Speaker's full name
- `title` (string, optional): Professional title
- `company` (string, optional): Company/organization
- `bio` (string, optional): Biography/description
- `created_at` (ISO 8601 datetime, required): Creation timestamp
- `updated_at` (ISO 8601 datetime, required): Last update timestamp

### Organizers Fields
- `id` (integer, required): Unique identifier
- `name` (string, required): Organizer name
- `website` (string, optional): Website URL
- `description` (string, optional): Description
- `created_at` (ISO 8601 datetime, required): Creation timestamp
- `updated_at` (ISO 8601 datetime, required): Last update timestamp

### Sponsors Fields
- `id` (integer, required): Unique identifier
- `name` (string, required): Sponsor name
- `tier` (string, optional): Sponsorship tier (platinum, gold, silver, bronze)
- `website` (string, optional): Website URL
- `logo_url` (string, optional): Logo image URL
- `created_at` (ISO 8601 datetime, required): Creation timestamp
- `updated_at` (ISO 8601 datetime, required): Last update timestamp

## Testing the Implementation

Once implemented, test each endpoint:

```bash
# Test speakers
curl -H "X-API-Key: pivotal_KtFoTEP2cRnOt6idBlcjIg4Cx1m7Mg04VINjMOeHn10" \
  https://tech-event-hub-wh5q8xynmq.replit.app/api/v1/speakers

# Test organizers
curl -H "X-API-Key: pivotal_KtFoTEP2cRnOt6idBlcjIg4Cx1m7Mg04VINjMOeHn10" \
  https://tech-event-hub-wh5q8xynmq.replit.app/api/v1/organizers

# Test sponsors
curl -H "X-API-Key: pivotal_KtFoTEP2cRnOt6idBlcjIg4Cx1m7Mg04VINjMOeHn10" \
  https://tech-event-hub-wh5q8xynmq.replit.app/api/v1/sponsors
```

Expected response: JSON data with the appropriate structure (not 404 HTML)

## After Implementation

Once the Resources Centre implements these endpoints:

1. Navigate to Pivotal CRM at `/resources-centre`
2. Click "Sync Now" button
3. Data will automatically sync from Resources Centre to Pivotal CRM
4. Speakers, organizers, and sponsors will be available in event forms
5. Reference data counts will update to show synced records

## Summary

**Action Required:** Implement the three GET endpoints in the Resources Centre repl at:
- https://tech-event-hub-wh5q8xynmq.replit.app

The Pivotal CRM integration is complete and ready to consume the data as soon as the endpoints are available.
