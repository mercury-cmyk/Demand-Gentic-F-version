# Call Monitoring & Alerting Setup Guide

## Overview
Monitoring system for tracking voicemail detection improvements and detecting issues.

---

## Components Created

### 1. Monitoring Service
**File**: [`server/services/call-monitoring-service.ts`](server/services/call-monitoring-service.ts)

**Features**:
- Get call metrics by date range
- Check alert thresholds
- Generate daily reports
- Detect false positives
- Track voicemail detection efficiency

### 2. Monitoring Job
**File**: [`server/jobs/call-monitoring-job.ts`](server/jobs/call-monitoring-job.ts)

**Purpose**: Scheduled job to run daily monitoring checks

### 3. Monitoring API Routes
**File**: [`server/routes/call-monitoring-routes.ts`](server/routes/call-monitoring-routes.ts)

**Endpoints**:
- `GET /api/monitoring/calls/metrics` - Get metrics for date range
- `GET /api/monitoring/calls/daily-report` - Get daily report
- `GET /api/monitoring/calls/false-positives` - Detect potential false positives
- `GET /api/monitoring/calls/voicemail-efficiency` - Voicemail detection stats
- `GET /api/monitoring/calls/health` - System health check

---

## Setup Instructions

### Step 1: Register Monitoring Routes

Add to your main routes file (e.g., `server/routes.ts` or `server/index.ts`):

```typescript
import callMonitoringRoutes from './routes/call-monitoring-routes';

// Add this line with your other route registrations
app.use('/api/monitoring/calls', callMonitoringRoutes);
```

### Step 2: Schedule Daily Monitoring Job

#### Option A: Using node-cron (Recommended)

1. Install node-cron:
```bash
npm install node-cron
npm install --save-dev @types/node-cron
```

2. Add to your server startup file:
```typescript
import cron from 'node-cron';
import { runMonitoringCheck } from './services/call-monitoring-service';

// Run monitoring check daily at 8 AM
cron.schedule('0 8 * * *', async () => {
  console.log('Running daily call monitoring check...');
  try {
    await runMonitoringCheck();
  } catch (error) {
    console.error('Monitoring check failed:', error);
  }
});
```

#### Option B: Using PM2 Cron

Add to `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    // ... your existing apps
    {
      name: 'call-monitoring',
      script: 'server/jobs/call-monitoring-job.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      cron_restart: '0 8 * * *', // Daily at 8 AM
      autorestart: false,
    }
  ]
};
```

#### Option C: Using System Cron

Add to crontab:
```bash
# Edit crontab
crontab -e

# Add this line (adjust path as needed)
0 8 * * * cd /path/to/DemandEarn-AI && npx tsx server/jobs/call-monitoring-job.ts >> /var/log/call-monitoring.log 2>&1
```

### Step 3: Run Manual Test

Test the monitoring system:

```bash
# Run the monitoring job manually
npx tsx server/jobs/call-monitoring-job.ts

# Or test the monitoring service directly
npx tsx -e "
import { runMonitoringCheck } from './server/services/call-monitoring-service';
runMonitoringCheck().then(() => process.exit(0));
"
```

---

## API Usage Examples

### Get Last 7 Days Metrics
```bash
curl http://localhost:5000/api/monitoring/calls/metrics
```

### Get Specific Date Range
```bash
curl "http://localhost:5000/api/monitoring/calls/metrics?startDate=2026-01-10&endDate=2026-01-16"
```

### Get Daily Report
```bash
curl "http://localhost:5000/api/monitoring/calls/daily-report?date=2026-01-15"
```

### Check for False Positives
```bash
curl "http://localhost:5000/api/monitoring/calls/false-positives?hours=48"
```

### Get Voicemail Detection Efficiency
```bash
curl "http://localhost:5000/api/monitoring/calls/voicemail-efficiency?days=7"
```

### Health Check
```bash
curl http://localhost:5000/api/monitoring/calls/health
```

---

## Dashboard Integration

### Option 1: Simple HTML Dashboard

Create `client/monitoring-dashboard.html`:

```html



    Call Monitoring Dashboard
    
    
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { display: inline-block; margin: 20px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .alert { background-color: #fff3cd; padding: 15px; margin: 10px 0; border-left: 4px solid #ffc107; }
        .critical { background-color: #f8d7da; border-left-color: #dc3545; }
        canvas { max-width: 800px; margin: 20px 0; }
    


    📊 Call Monitoring Dashboard

    
    
    

    Voicemail Detection Efficiency
    

    


```

### Option 2: React Component

If using React, create a monitoring component:

```typescript
import React, { useEffect, useState } from 'react';

export function CallMonitoringDashboard() {
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState([]);

  useEffect(() => {
    async function loadData() {
      const healthRes = await fetch('/api/monitoring/calls/health');
      const healthData = await healthRes.json();
      setHealth(healthData);

      const metricsRes = await fetch('/api/monitoring/calls/metrics');
      const metricsData = await metricsRes.json();
      setMetrics(metricsData.data);
    }

    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000); // Refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  if (!health) return Loading...;

  return (
    
      📊 Call Monitoring

      
        Status: {health.status}
        {health.alerts.map((alert, i) => (
          {alert}
        ))}
      

      
        {metrics.map(m => (
          
            {m.date}
            Total Calls: {m.totalCalls}
            Human Rate: {m.humanDetectionRate.toFixed(1)}%
            Avg VM Duration: {Math.round(m.avgVoicemailDuration)}s
          
        ))}
      
    
  );
}
```

---

## Alert Configuration

### Customize Alert Thresholds

Edit thresholds in `server/services/call-monitoring-service.ts`:

```typescript
const DEFAULT_THRESHOLDS: AlertThresholds = {
  maxAvgVoicemailDuration: 75,    // Alert if avg > 75s
  minHumanDetectionRate: 10,      // Alert if  40%
  maxCallsEndedAt60s: 90,         // Alert if > 90% end at 60s
  minCallCompletionRate: 90,      // Alert if  {
  const emoji = severity === 'critical' ? '🚨' : '⚠️';
  const color = severity === 'critical' ? '#dc3545' : '#ffc107';

  // Console logging
  console.error(`\n${emoji} ${severity.toUpperCase()} ALERT\n${'='.repeat(50)}\n${message}\n${'='.repeat(50)}\n`);

  // Slack webhook
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    try {
      await axios.post(slackWebhook, {
        text: `${emoji} Call Monitoring Alert`,
        attachments: [{
          color: color,
          title: `${severity.toUpperCase()} Alert`,
          text: message,
          footer: 'Call Monitoring System',
          ts: Math.floor(Date.now() / 1000)
        }]
      });
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }
}
```

### Integrate with PagerDuty

```typescript
import axios from 'axios';

export async function sendPagerDutyAlert(message: string, severity: 'warning' | 'critical'): Promise {
  const apiKey = process.env.PAGERDUTY_API_KEY;
  const serviceId = process.env.PAGERDUTY_SERVICE_ID;

  if (!apiKey || !serviceId) return;

  const pagerDutySeverity = severity === 'critical' ? 'critical' : 'warning';

  try {
    await axios.post('https://api.pagerduty.com/incidents', {
      incident: {
        type: 'incident',
        title: `Call Monitoring ${severity.toUpperCase()} Alert`,
        service: { id: serviceId, type: 'service_reference' },
        urgency: pagerDutySeverity === 'critical' ? 'high' : 'low',
        body: { type: 'incident_body', details: message }
      }
    }, {
      headers: {
        'Authorization': `Token token=${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.pagerduty+json;version=2'
      }
    });
  } catch (error) {
    console.error('Failed to send PagerDuty alert:', error);
  }
}
```

---

## Monitoring Checklist

### Daily
- [ ] Check health endpoint status
- [ ] Review daily report
- [ ] Verify avg voicemail duration = NOW() - INTERVAL '24 hours'\`)
  .then(r => console.log('Recent calls:', r.rows[0]))
  .then(() => process.exit(0));
"
```

### Alerts Not Triggering
- Check threshold values in `call-monitoring-service.ts`
- Verify `sendAlert` function is being called
- Check Slack/PagerDuty credentials if using integrations

### Job Not Running
```bash
# Check if job is scheduled
pm2 list

# Check cron logs
tail -f /var/log/call-monitoring.log

# Test job manually
npx tsx server/jobs/call-monitoring-job.ts
```

---

## Environment Variables

Add these to your `.env` file:

```bash
# Slack Integration (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# PagerDuty Integration (optional)
PAGERDUTY_API_KEY=your_api_key_here
PAGERDUTY_SERVICE_ID=your_service_id_here

# Monitoring Configuration
MONITORING_ENABLED=true
ALERT_THRESHOLD_VOICEMAIL_DURATION=75
ALERT_THRESHOLD_MIN_HUMAN_RATE=10
ALERT_THRESHOLD_MAX_HUMAN_RATE=40
```

---

## Next Steps

1. ✅ Set up monitoring routes in your API
2. ✅ Schedule daily monitoring job
3. ✅ Test all API endpoints
4. ✅ Configure alert integrations
5. ✅ Create dashboard (optional)
6. ✅ Document any custom thresholds
7. ✅ Train team on monitoring system

---

**Setup Date**: January 16, 2026
**Monitoring Version**: 1.0
**Status**: Ready for deployment