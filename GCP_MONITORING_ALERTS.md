# GCP Monitoring, Logging & Alerts

This document covers observability setup for production monitoring and incident response.

## 📊 Cloud Logging

Cloud Run automatically sends logs to Cloud Logging. View them:

```bash
SERVICE="pivotalcrm-service"
REGION="us-central1"
PROJECT_ID="pivotalcrm-2026"

# View recent logs
gcloud run logs read $SERVICE --region=$REGION --limit=50 --project=$PROJECT_ID

# Stream logs in real-time
gcloud run logs read $SERVICE --region=$REGION --follow --project=$PROJECT_ID

# Filter by severity (ERROR, WARNING, INFO)
gcloud run logs read $SERVICE --region=$REGION --limit=50 \
  --filter='severity>=ERROR' --project=$PROJECT_ID

# Search for specific error
gcloud run logs read $SERVICE --region=$REGION --limit=50 \
  --filter='textPayload=~"ERROR.*database"' --project=$PROJECT_ID
```

---

## 🚨 Cloud Monitoring Alerts

### Create Alert Policy for High Error Rate

```bash
PROJECT_ID="pivotalcrm-2026"
SERVICE="pivotalcrm-service"
NOTIFICATION_CHANNEL_ID="<your-email-notification-channel>"

# Create alert policy (requires gcloud beta)
gcloud beta monitoring policies create \
  --notification-channels=$NOTIFICATION_CHANNEL_ID \
  --display-name="Cloud Run - High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=5 \
  --condition-threshold-duration=300s \
  --condition-threshold-comparison=COMPARISON_GT \
  --project=$PROJECT_ID
```

Or use the GCP Console:
1. Go to **Cloud Monitoring** → **Alerting** → **Create Policy**
2. Select **Metric** → **Resource type**: Cloud Run service → **Metric**: `run.googleapis.com/request_count` (error rate)
3. Set threshold: > 5% for 5 minutes
4. Add notification channel (email, Slack, etc.)

### Create Alert for High Latency

```bash
# Cloud Run request latency > 2000ms for 5 minutes
gcloud beta monitoring policies create \
  --notification-channels=$NOTIFICATION_CHANNEL_ID \
  --display-name="Cloud Run - High Latency" \
  --condition-display-name="Request latency > 2s" \
  --condition-threshold-metric-type="run.googleapis.com/request_latencies" \
  --condition-threshold-value=2000 \
  --project=$PROJECT_ID
```

### Create Alert for Out of Quota

```bash
gcloud beta monitoring policies create \
  --notification-channels=$NOTIFICATION_CHANNEL_ID \
  --display-name="Cloud Run - Out of Quota" \
  --condition-display-name="Quota exceeded" \
  --project=$PROJECT_ID
```

---

## 📈 Create Monitoring Dashboard

Create a custom dashboard to visualize key metrics:

```bash
PROJECT_ID="pivotalcrm-2026"
SERVICE="pivotalcrm-service"

# Create dashboard via REST API
cat > dashboard.json << 'EOF'
{
  "displayName": "Pivotal CRM - Production",
  "gridLayout": {
    "widgets": [
      {
        "title": "Request Rate (requests/min)",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"pivotalcrm-service\" metric.type=\"run.googleapis.com/request_count\""
                }
              }
            }
          ]
        }
      },
      {
        "title": "Error Rate (%)",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"pivotalcrm-service\" metric.type=\"run.googleapis.com/request_count\" metric.labels.response_code_class=\"5xx\""
                }
              }
            }
          ]
        }
      },
      {
        "title": "Request Latency (p95 ms)",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"pivotalcrm-service\" metric.type=\"run.googleapis.com/request_latencies\""
                }
              }
            }
          ]
        }
      },
      {
        "title": "Memory Usage",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"pivotalcrm-service\" metric.type=\"run.googleapis.com/container_memory_utilization\""
                }
              }
            }
          ]
        }
      }
    ]
  }
}
EOF

gcloud monitoring dashboards create --config-from-file=dashboard.json --project=$PROJECT_ID
```

---

## 🔍 Error Reporting

Cloud Run automatically reports errors to Error Reporting. View them:

```bash
# View error reports
gcloud logging read \
  'resource.type="cloud_run_revision" severity="ERROR"' \
  --limit=50 \
  --format=json \
  --project=$PROJECT_ID | jq '.[] | {timestamp: .timestamp, message: .textPayload}'
```

Or use the GCP Console:
1. Go to **Error Reporting**
2. View grouped errors with stack traces and occurrence counts

---

## 📝 Application Logging Best Practices

### Structured Logging in Node.js

Update your logging to use JSON format for better parsing:

```typescript
// Log with severity levels for Cloud Logging
const log = (message: string, severity: 'INFO' | 'WARNING' | 'ERROR' = 'INFO', extra?: any) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    severity,
    message,
    ...extra
  }));
};

// Usage
log('User login successful', 'INFO', { userId: '123', email: 'user@example.com' });
log('Database connection failed', 'ERROR', { code: 'ECONNREFUSED', host: 'db.example.com' });
```

### Key Metrics to Log

```typescript
// Database query performance
const start = Date.now();
const result = await db.query(...);
const duration = Date.now() - start;

log(`Query executed`, 'INFO', {
  query: 'SELECT * FROM users',
  duration,
  rows: result.rowCount
});

// External API calls
try {
  const response = await fetch(url);
  log('API call successful', 'INFO', {
    url,
    statusCode: response.status,
    duration
  });
} catch (error) {
  log('API call failed', 'ERROR', {
    url,
    error: error.message,
    duration
  });
}

// Business events
log('Campaign created', 'INFO', {
  campaignId: campaign.id,
  recipientCount: campaign.recipients.length,
  templateId: campaign.template_id
});
```

---

## 🧪 Health Checks

Ensure your `/api/health` endpoint returns meaningful status:

```typescript
// server/routes.ts
app.get('/api/health', async (req, res) => {
  try {
    // Check database
    await db.select().from(users).limit(1);
    
    // Check Redis
    await redis.ping();
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      redis: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

app.get('/api/status', async (req, res) => {
  // Lightweight status endpoint
  res.status(200).json({
    status: 'ok',
    version: '1.0.0',
    environment: process.env.NODE_ENV
  });
});
```

---

## 📊 Key Metrics to Monitor

| Metric | Target | Alert Threshold |
|---|---|---|
| Error Rate | < 1% | > 5% |
| Request Latency (p95) | < 500ms | > 2000ms |
| Memory Usage | < 50% | > 80% |
| CPU Usage | < 30% | > 70% |
| Availability | > 99.9% | < 99.5% |
| Database Connections | < 10 | > 20 |
| Redis Memory | < 500MB | > 900MB |

---

## 🔄 Incident Response Runbook

### High Error Rate (> 5%)

1. **Check logs**:
   ```bash
   gcloud run logs read $SERVICE --region=$REGION --filter='severity="ERROR"' --limit=50
   ```

2. **Identify pattern**:
   - Database connection failures?
   - External API timeouts?
   - Code exceptions?

3. **Take action**:
   - If database: Check Cloud SQL instance status
   - If external API: Check network connectivity
   - If code: Prepare rollback

4. **Rollback if needed**:
   ```bash
   gcloud run deploy $SERVICE --region=$REGION --image=$OLD_IMAGE
   ```

### High Latency (> 2s p95)

1. **Check resource utilization**:
   ```bash
   gcloud run services describe $SERVICE --format='value(spec.template.spec.containers[0].resources)'
   ```

2. **Increase resources** if needed:
   ```bash
   gcloud run services update $SERVICE \
     --memory=1Gi \
     --cpu=2 \
     --region=$REGION
   ```

3. **Check external dependencies**:
   - Database query performance
   - Redis latency
   - External API response times

---

## 💾 Log Retention & Export

### Set Log Retention

```bash
# Keep logs for 30 days
gcloud logging sinks create cloud-run-logs \
  storage.googleapis.com/pivotal-crm-logs \
  --log-filter='resource.type="cloud_run_revision" resource.labels.service_name="pivotalcrm-service"' \
  --project=$PROJECT_ID
```

### Export to BigQuery for Analysis

```bash
# Create BigQuery dataset
bq mk --dataset --location=US pivotal_crm_logs

# Create sink to BigQuery
gcloud logging sinks create bigquery-export \
  bigquery.googleapis.com/projects/$PROJECT_ID/datasets/pivotal_crm_logs \
  --log-filter='resource.type="cloud_run_revision"' \
  --project=$PROJECT_ID
```

Query logs in BigQuery:
```sql
SELECT
  timestamp,
  textPayload,
  severity,
  resource.labels.service_name
FROM `pivotalcrm-2026.pivotal_crm_logs.cloudrun_googleapis_com_run_cloud_run_googleapis_com_projects_pivotalcrm-2026_locations_us-central1_services_pivotalcrm-service`
WHERE severity = 'ERROR'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
ORDER BY timestamp DESC
LIMIT 100;
```

