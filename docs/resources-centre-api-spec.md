# Resources Centre API Specification

This document specifies the REST API endpoints that need to be implemented in the Resources Centre to enable automated data synchronization with Pivotal CRM.

## Authentication

All API endpoints should be protected with API key authentication:
- Header: `X-API-Key: <api_key>`
- The API key should be configurable in Resources Centre environment variables
- Return 401 Unauthorized if the API key is invalid or missing

## Base URL

```
https://workspace.wh5q8xynmq.repl.co/api/v1/
```

All endpoints use the `/api/v1/` prefix to match the existing Resources Centre API structure.

## Endpoints

### 1. Get All Speakers

**Endpoint:** `GET /api/v1/speakers`

**Headers:**
```
X-API-Key: <api_key>
```

**Response:** 200 OK
```json
{
  "speakers": [
    {
      "id": 1,
      "name": "Dr. Jane Smith",
      "title": "Chief Data Officer",
      "company": "TechCorp",
      "bio": "AI and data science expert with 15 years of experience...",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Field Specifications:**
- `id` (integer, required): Unique identifier
- `name` (string, required): Speaker's full name
- `title` (string, optional): Professional title
- `company` (string, optional): Company/organization
- `bio` (string, optional): Biography/description
- `created_at` (ISO 8601 datetime, required): Creation timestamp
- `updated_at` (ISO 8601 datetime, required): Last update timestamp

---

### 2. Get All Organizers

**Endpoint:** `GET /api/v1/organizers`

**Headers:**
```
X-API-Key: <api_key>
```

**Response:** 200 OK
```json
{
  "organizers": [
    {
      "id": 1,
      "name": "Innovation Summit",
      "website": "https://innovationsummit.com",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Field Specifications:**
- `id` (integer, required): Unique identifier
- `name` (string, required): Organizer name
- `website` (string, optional): Website URL
- `created_at` (ISO 8601 datetime, required): Creation timestamp
- `updated_at` (ISO 8601 datetime, required): Last update timestamp

---

### 3. Get All Sponsors

**Endpoint:** `GET /api/v1/sponsors`

**Headers:**
```
X-API-Key: <api_key>
```

**Response:** 200 OK
```json
{
  "sponsors": [
    {
      "id": 1,
      "name": "CloudSystems Inc",
      "website": "https://cloudsystems.com",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Field Specifications:**
- `id` (integer, required): Unique identifier
- `name` (string, required): Sponsor name
- `website` (string, optional): Website URL
- `created_at` (ISO 8601 datetime, required): Creation timestamp
- `updated_at` (ISO 8601 datetime, required): Last update timestamp

---

## Optional: Delta Sync Support

For efficiency, the Resources Centre can optionally support delta syncs by accepting a `since` query parameter:

**Example:**
```
GET /api/v1/speakers?since=2024-01-15T10:30:00Z
```

This returns only records created or updated after the specified timestamp, reducing payload size for incremental syncs.

---

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Invalid or missing API key"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "Description of the error"
}
```

---

## Implementation Notes

### Flask Example (Python)

```python
from flask import Blueprint, jsonify, request
from functools import wraps
import os

api_bp = Blueprint('api', __name__, url_prefix='/api/v1')

def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        expected_key = os.environ.get('API_KEY')  # Same key used for /api/v1/events
        if api_key != expected_key:
            return jsonify({'error': 'Invalid or missing API key'}), 401
        return f(*args, **kwargs)
    return decorated_function

@api_bp.route('/speakers', methods=['GET'])
@require_api_key
def get_speakers():
    # Query speakers from database
    speakers = Speaker.query.all()
    return jsonify({
        'speakers': [
            {
                'id': speaker.id,
                'name': speaker.name,
                'title': speaker.title,
                'company': speaker.company,
                'bio': speaker.bio,
                'created_at': speaker.created_at.isoformat(),
                'updated_at': speaker.updated_at.isoformat()
            }
            for speaker in speakers
        ]
    })

@api_bp.route('/organizers', methods=['GET'])
@require_api_key
def get_organizers():
    organizers = Organizer.query.all()
    return jsonify({
        'organizers': [
            {
                'id': org.id,
                'name': org.name,
                'website': org.website,
                'created_at': org.created_at.isoformat(),
                'updated_at': org.updated_at.isoformat()
            }
            for org in organizers
        ]
    })

@api_bp.route('/sponsors', methods=['GET'])
@require_api_key
def get_sponsors():
    sponsors = Sponsor.query.all()
    return jsonify({
        'sponsors': [
            {
                'id': sponsor.id,
                'name': sponsor.name,
                'website': sponsor.website,
                'created_at': sponsor.created_at.isoformat(),
                'updated_at': sponsor.updated_at.isoformat()
            }
            for sponsor in sponsors
        ]
    })
```

---

## Testing

Use curl or Postman to test the endpoints:

```bash
# Test speakers endpoint
curl -H "X-API-Key: pivotal_KtFoTEP2cRnOt6idBlcjIg4Cx1m7Mg04VINjMOeHn10" \
  https://workspace.wh5q8xynmq.repl.co/api/v1/speakers

# Test organizers endpoint
curl -H "X-API-Key: pivotal_KtFoTEP2cRnOt6idBlcjIg4Cx1m7Mg04VINjMOeHn10" \
  https://workspace.wh5q8xynmq.repl.co/api/v1/organizers

# Test sponsors endpoint
curl -H "X-API-Key: pivotal_KtFoTEP2cRnOt6idBlcjIg4Cx1m7Mg04VINjMOeHn10" \
  https://workspace.wh5q8xynmq.repl.co/api/v1/sponsors
```

Expected response structure for each endpoint is documented above.
