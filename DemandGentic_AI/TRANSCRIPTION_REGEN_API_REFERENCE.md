# Transcription Regeneration - API Reference & Examples

## Base Configuration

```bash
# Set these before running curl commands
export BASE_URL="https://demandgentic.ai"
export API_TOKEN="your-admin-api-token"
export AUTH_HEADER="Authorization: Bearer $API_TOKEN"
```

---

## Regeneration Endpoint

### Direct Batch Regeneration

Regenerate transcripts for specific calls immediately (synchronous).

**Endpoint**: `POST /api/call-intelligence/transcription-gaps/regenerate`

**Parameters**:
- `callIds` (array): List of call_session or dialer_call_attempts IDs (max 50)
- `strategy` (string): `telnyx_phone_lookup` | `recording_url` | `auto` (default: `telnyx_phone_lookup`)
- `force` (boolean): If true, regenerate even if transcript exists (default: false)

**Example 1: Regenerate 5 specific calls**

```bash
curl -X POST "$BASE_URL/api/call-intelligence/transcription-gaps/regenerate" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "callIds": [
      "call_session_abc123",
      "call_session_def456",
      "call_session_ghi789",
      "dialer_attempt_jkl012",
      "dialer_attempt_mno345"
    ],
    "strategy": "telnyx_phone_lookup",
    "force": false
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "queued": 5,
    "succeeded": 4,
    "analyzed": 4,
    "failed": 1,
    "message": "Regenerated 4 calls with 4 analyzed and disposition updated in real-time",
    "errors": [
      {
        "callId": "call_session_ghi789",
        "error": "No recording URL found"
      }
    ]
  }
}
```

**Example 2: Force regeneration with existing URLs only**

```bash
curl -X POST "$BASE_URL/api/call-intelligence/transcription-gaps/regenerate" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "callIds": ["call_session_abc123"],
    "strategy": "recording_url",
    "force": true
  }'
```

**Example 3: Regenerate with automatic strategy selection**

```bash
curl -X POST "$BASE_URL/api/call-intelligence/transcription-gaps/regenerate" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "callIds": ["call_session_abc123", "call_session_def456"],
    "strategy": "auto"
  }'
```

---

## Worker Lifecycle Management

### Start Worker

Begin background processing of queued jobs.

**Endpoint**: `POST /api/call-intelligence/regeneration/worker/start`

```bash
curl -X POST "$BASE_URL/api/call-intelligence/regeneration/worker/start" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Worker started successfully",
    "status": {
      "running": true,
      "activeJobs": 0,
      "config": {
        "concurrency": 3,
        "maxRetries": 3,
        "batchSize": 50,
        "batchDelayMs": 2000,
        "strategy": "telnyx_phone_lookup",
        "verbose": true
      },
      "jobStats": {
        "pending": 4265,
        "inProgress": 0,
        "submitted": 0,
        "completed": 0,
        "failed": 0,
        "total": 4265
      }
    }
  }
}
```

### Stop Worker

Gracefully stop the background worker (doesn't lose progress).

**Endpoint**: `POST /api/call-intelligence/regeneration/worker/stop`

```bash
curl -X POST "$BASE_URL/api/call-intelligence/regeneration/worker/stop" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Worker stopped gracefully",
    "status": {
      "running": false,
      "activeJobs": 0
    }
  }
}
```

---

## Worker Status & Configuration

### Get Worker Status

Check if worker is running, current config, and job statistics.

**Endpoint**: `GET /api/call-intelligence/regeneration/worker/status`

```bash
curl -X GET "$BASE_URL/api/call-intelligence/regeneration/worker/status" \
  -H "$AUTH_HEADER"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "running": true,
    "activeJobs": 3,
    "config": {
      "concurrency": 3,
      "maxRetries": 3,
      "batchSize": 50,
      "batchDelayMs": 2000,
      "strategy": "telnyx_phone_lookup",
      "verbose": true
    },
    "jobStats": {
      "pending": 2100,
      "inProgress": 3,
      "submitted": 1500,
      "completed": 650,
      "failed": 12,
      "total": 4265
    }
  }
}
```

### Update Configuration

Update worker settings at runtime (no restart needed).

**Endpoint**: `POST /api/call-intelligence/regeneration/worker/config`

**Parameters**:
- `concurrency` (1-10): Number of parallel workers
- `batchSize` (1-50): Calls per API submission
- `batchDelayMs` (≥100): Delay between submissions (ms)
- `strategy` ("telnyx_phone_lookup" | "recording_url" | "auto"): Recording lookup method
- `maxRetries` (1-5): Retry attempts per batch
- `verbose` (boolean): Enable detailed logging

**Example 1: Increase concurrency to 5**

```bash
curl -X POST "$BASE_URL/api/call-intelligence/regeneration/worker/config" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "concurrency": 5
  }'
```

**Example 2: Adjust multiple settings**

```bash
curl -X POST "$BASE_URL/api/call-intelligence/regeneration/worker/config" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "concurrency": 5,
    "batchSize": 100,
    "batchDelayMs": 1500,
    "strategy": "recording_url",
    "verbose": false
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Configuration updated successfully",
    "updatedConfig": {
      "concurrency": 5,
      "batchSize": 100,
      "batchDelayMs": 1500,
      "strategy": "recording_url",
      "verbose": false
    },
    "currentStatus": {
      "running": true,
      "activeJobs": 5
    }
  }
}
```

---

## Progress Tracking

### Get Overall Progress

View regeneration progress and estimated time remaining.

**Endpoint**: `GET /api/call-intelligence/regeneration/progress`

```bash
curl -X GET "$BASE_URL/api/call-intelligence/regeneration/progress" \
  -H "$AUTH_HEADER"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "pending": 2100,
    "inProgress": 3,
    "submitted": 1500,
    "completed": 650,
    "failed": 12,
    "total": 4265,
    "progressPercent": 39,
    "estimatedRemainingMinutes": 85
  }
}
```

---

## Job Management

### List Jobs (with pagination & filtering)

**Endpoint**: `GET /api/call-intelligence/regeneration/jobs`

**Query Parameters**:
- `status` (optional): `pending` | `in_progress` | `submitted` | `completed` | `failed`
- `page` (default: 1): Page number for pagination
- `limit` (default: 50, max: 100): Results per page
- `sortBy` (default: `created_at`): Field to sort by
- `sortDir` (default: `DESC`): `ASC` or `DESC`

**Example 1: List first 10 pending jobs**

```bash
curl -X GET "$BASE_URL/api/call-intelligence/regeneration/jobs?status=pending&limit=10&page=1" \
  -H "$AUTH_HEADER"
```

**Example 2: List failed jobs**

```bash
curl -X GET "$BASE_URL/api/call-intelligence/regeneration/jobs?status=failed&limit=50" \
  -H "$AUTH_HEADER"
```

**Example 3: List completed jobs, sorted by completion time (newest first)**

```bash
curl -X GET "$BASE_URL/api/call-intelligence/regeneration/jobs?status=completed&sortBy=completed_at&sortDir=DESC&limit=25" \
  -H "$AUTH_HEADER"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "id": "regen_job_abc123",
        "call_id": "call_session_def456",
        "source": "call_sessions",
        "status": "completed",
        "attempts": 1,
        "error": null,
        "created_at": "2025-01-15T10:00:00Z",
        "completed_at": "2025-01-15T10:15:00Z"
      },
      {
        "id": "regen_job_def789",
        "call_id": "call_session_ghi123",
        "source": "call_sessions",
        "status": "failed",
        "attempts": 3,
        "error": "No recording URL found",
        "created_at": "2025-01-15T09:45:00Z",
        "completed_at": "2025-01-15T10:05:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 4265,
      "pages": 86
    }
  }
}
```

---

## Monitoring Scripts

### Real-Time Progress Monitor

```bash
#!/bin/bash
# monitor-progress.sh

BASE_URL="https://demandgentic.ai"
API_TOKEN="your-token"

while true; do
  clear
  echo "=== Transcription Regeneration Progress ==="
  curl -s -X GET "$BASE_URL/api/call-intelligence/regeneration/progress" \
    -H "Authorization: Bearer $API_TOKEN" | jq '.data | {progressPercent, estimatedRemainingMinutes, pending, completed, failed}'
  
  sleep 30  # Check every 30 seconds
done
```

### Check for Stuck Jobs

```bash
#!/bin/bash
# check-stuck-jobs.sh

BASE_URL="https://demandgentic.ai"
API_TOKEN="your-token"

echo "Checking for jobs stuck in progress..."
curl -s -X GET "$BASE_URL/api/call-intelligence/regeneration/jobs?status=in_progress&limit=100" \
  -H "Authorization: Bearer $API_TOKEN" | jq '.data.jobs[] | {call_id, created_at, completed_at}'
```

### Auto-Scaling Script

```bash
#!/bin/bash
# auto-scale-worker.sh
# Adjusts concurrency based on progress

BASE_URL="https://demandgentic.ai"
API_TOKEN="your-token"

while true; do
  # Get current progress
  PROGRESS=$(curl -s -X GET "$BASE_URL/api/call-intelligence/regeneration/progress" \
    -H "Authorization: Bearer $API_TOKEN" | jq '.data.progressPercent')
  
  # Adjust concurrency based on progress
  if [ "$PROGRESS" -lt 25 ]; then
    # Early phase: use high concurrency
    CONCURRENCY=8
  elif [ "$PROGRESS" -lt 75 ]; then
    # Mid phase: moderate concurrency
    CONCURRENCY=5
  else
    # Late phase: reduce to avoid rate limiting
    CONCURRENCY=2
  fi
  
  # Update config
  curl -X POST "$BASE_URL/api/call-intelligence/regeneration/worker/config" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_TOKEN" \
    -d "{\"concurrency\": $CONCURRENCY}"
  
  echo "Progress: $PROGRESS%, Concurrency set to: $CONCURRENCY"
  sleep 300  # Check every 5 minutes
done
```

---

## Emergency Procedures

### Reset Stuck Jobs

```bash
# Stop the worker first
curl -X POST "$BASE_URL/api/call-intelligence/regeneration/worker/stop" \
  -H "Authorization: Bearer $API_TOKEN"

# Reset stuck jobs via database (direct SQL)
# UPDATE transcription_regeneration_jobs 
# SET status = 'pending' 
# WHERE status = 'in_progress' 
# AND updated_at  failed_jobs.json
```

### One-Liner Status Check

```bash
echo "Progress: $(curl -s -X GET "$BASE_URL/api/call-intelligence/regeneration/progress" -H "$AUTH_HEADER" | jq '.data.progressPercent')% | Running: $(curl -s -X GET "$BASE_URL/api/call-intelligence/regeneration/worker/status" -H "$AUTH_HEADER" | jq '.data.running')"
```