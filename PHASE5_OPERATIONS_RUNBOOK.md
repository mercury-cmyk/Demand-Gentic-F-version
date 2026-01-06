# Phase 5: Operations & Incident Response Runbook

## 📘 Daily Operations

### Pre-Campaign Launch Checklist

**24 Hours Before:**
- [ ] Verify all email templates render correctly
- [ ] Test sender profile authentication status
- [ ] Check email list quality (validation, duplicates)
- [ ] Review audience segmentation logic
- [ ] Verify tracking pixels are configured
- [ ] Test email delivery to internal accounts
- [ ] Confirm compliance footer/unsubscribe link
- [ ] Review A/B test setup if applicable
- [ ] Check database backups are current
- [ ] Monitor Redis queue status

**1 Hour Before:**
- [ ] Confirm app server health (all endpoints responding)
- [ ] Verify worker processes are running
- [ ] Check email service credentials are valid
- [ ] Monitor system resources (CPU, memory, disk)
- [ ] Confirm database connections are healthy
- [ ] Review recent error logs
- [ ] Verify SMTP rate limits not exceeded
- [ ] Confirm webhook endpoints are accessible

**Launch:**
- [ ] Send test emails to internal accounts
- [ ] Monitor email delivery in first 5 minutes
- [ ] Watch error rates (target < 0.5%)
- [ ] Monitor queue depth (should be processing)
- [ ] Check email service provider status page
- [ ] Monitor SMTP connection pool

### Post-Campaign Monitoring

**First Hour:**
- Monitor metrics every 5 minutes:
  - Sent count increasing
  - Delivery errors < 1%
  - Queue depth processing normally
  - No spike in 5xx errors
  - Open/click rates normal for channel

**First 24 Hours:**
- Daily review:
  - Total sent count matches expected
  - Bounce rate normal (< 5%)
  - Database size growth normal
  - Email service provider status
  - Webhook deliveries completed

**Ongoing (Week 1-2):**
- Monitor engagement metrics
- Track unsubscribe rates
- Review bounced emails
- Monitor authentication issues
- Check database query performance

---

## 🚨 Incident Response

### Incident Severity Levels

**🔴 CRITICAL (Response Time: 5-15 minutes)**
- Email service completely down
- Database unreachable
- Redis queue full or crashed
- Worker processes crashed
- Authentication service down
- > 50% delivery failure rate
- SMTP connection exhausted

**🟠 HIGH (Response Time: 15-30 minutes)**
- Elevated error rates (10-50%)
- Partial email delivery failures
- Slow database queries
- Memory usage > 85%
- Email service rate limited
- Webhook delivery failures

**🟡 MEDIUM (Response Time: 30-60 minutes)**
- Elevated bounce rate (> 10%)
- Slow API response times
- Increased error logs
- Database connection pool strained
- Minor worker process issues

**🟢 LOW (Response Time: Next business day)**
- Minor email template issues
- Documentation needs update
- Performance below target but within limits

---

## 🚨 Incident Playbooks

### Incident 1: Email Service Completely Down

**Symptoms:**
```
- 0% delivery rate
- Email service API returning 5xx errors
- Worker logs showing connection errors
```

**Investigation (5 min):**
```bash
# Check email service provider status
curl https://api.sendgrid.com/v3/mail/send -X POST
# Expected: 200/202, Actual: 503/error

# Check credentials
echo $SENDGRID_API_KEY

# Verify network connectivity
ping api.sendgrid.com
```

**Immediate Actions (10 min):**
1. **Create incident**: `#incidents` Slack channel
2. **Alert team**: "@team Email service down - investigating"
3. **Check provider status**: https://status.sendgrid.com
4. **Verify API credentials** are correct
5. **Check rate limits**: Query usage last 24 hours
6. **Pause campaign** if not already complete

**Resolution:**
```bash
# Option 1: Switch to backup email service
UPDATE campaigns SET email_service = 'mailgun' WHERE id = ?;

# Option 2: Wait for service recovery
# Monitor service status page every 5 minutes

# Option 3: Scale back campaign
UPDATE campaigns SET daily_rate = 100 WHERE id = ?;
```

**Recovery Checklist:**
- [ ] Service status returns to normal
- [ ] Test email delivery working
- [ ] Resume campaign
- [ ] Monitor delivery for 30 minutes
- [ ] Document incident in wiki
- [ ] Schedule postmortem

### Incident 2: Database Connection Pool Exhausted

**Symptoms:**
```
Error: FATAL: remaining connection slots reserved for non-replication superuser connections
Connection pool size: 20/20 (all used)
API response time: > 5000ms
```

**Investigation (5 min):**
```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;
-- Expected: < 15, Actual: 20+

-- See which queries are long-running
SELECT pid, query, query_start FROM pg_stat_activity 
WHERE query NOT LIKE '%pg_stat%'
ORDER BY query_start ASC;
```

**Immediate Actions (10 min):**
1. **Alert team**: "Database connection pool exhausted"
2. **Restart application**:
   ```bash
   docker-compose restart app worker
   ```
3. **Kill long-running queries** (if safe):
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE query LIKE '%SELECT%' AND query_start < now() - interval '10 minutes';
   ```
4. **Scale workers down** to reduce connections:
   ```bash
   docker-compose up -d --scale worker=2
   ```

**Root Cause Analysis:**
```sql
-- Check for N+1 query patterns
SELECT query, count(*) FROM pg_stat_activity GROUP BY query;

-- Check for unfinished transactions
SELECT pid, usename, query, query_start FROM pg_stat_activity
WHERE state = 'idle in transaction';
```

**Long-term Fix:**
- Increase connection pool size
- Add connection pooling (PgBouncer)
- Optimize slow queries
- Add indexes to frequently queried columns

---

### Incident 3: Redis Queue Full / Workers Crashed

**Symptoms:**
```
Redis memory: 95%+
Queue depth: 100,000+ (growing)
Worker errors: "redis: read tcp: connection reset"
```

**Investigation (5 min):**
```bash
# Check Redis memory
redis-cli INFO memory
# Expected: used_memory < 80% of max

# Check queue depth
redis-cli LLEN email_queue
# Expected: < 1,000

# Check worker logs
docker logs worker-1
docker logs worker-2
```

**Immediate Actions (10 min):**
1. **Scale up workers**:
   ```bash
   docker-compose up -d --scale worker=10
   ```
2. **Monitor queue depth**:
   ```bash
   watch -n 1 'redis-cli LLEN email_queue'
   ```
3. **Check for stuck jobs**:
   ```bash
   redis-cli ZRANGE failed_jobs 0 -1
   ```
4. **Increase Redis memory** if needed:
   ```bash
   docker exec redis redis-cli CONFIG SET maxmemory 4gb
   ```

**Recovery Checklist:**
- [ ] Queue depth decreasing
- [ ] Worker memory usage normal
- [ ] Worker processes healthy
- [ ] No more worker errors
- [ ] Resume normal worker count

---

### Incident 4: Elevated Bounce/Error Rates

**Symptoms:**
```
Bounce rate: 15% (normal: 2-5%)
Error count in last hour: 500 (normal: < 50)
Failed delivery emails pile up
```

**Investigation (5 min):**
```sql
-- Check bounce reasons
SELECT bounce_type, COUNT(*) 
FROM email_events 
WHERE type = 'bounced' AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY bounce_type;

-- Check error patterns
SELECT error_code, COUNT(*) FROM email_errors 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY error_code;
```

**Common Causes & Fixes:**

| Error | Cause | Fix |
|-------|-------|-----|
| 550 "User not found" | Invalid email list | Re-validate contacts |
| 421 "Service unavailable" | SMTP throttling | Reduce send rate |
| 554 "Blocked by ISP" | Sender reputation | Warm up sender IP |
| Invalid/Malformed | Template error | Review template rendering |

**Immediate Actions:**
```bash
# Option 1: Reduce send rate
UPDATE campaigns SET max_send_rate = 100 WHERE id = ?;

# Option 2: Pause and investigate
UPDATE campaigns SET status = 'paused' WHERE id = ?;

# Option 3: Switch sender/service
UPDATE campaigns SET sender_profile_id = ? WHERE id = ?;
```

---

### Incident 5: Performance Degradation (API Slow)

**Symptoms:**
```
API response time: > 1000ms (normal: < 200ms)
Error rate: 2-5% (normal: < 0.5%)
User complaints: "Campaign builder is sluggish"
```

**Investigation (5 min):**
```bash
# Check database query performance
SELECT query, calls, mean_time, max_time FROM pg_stat_statements
ORDER BY mean_time DESC LIMIT 10;

# Check system resources
docker stats
# Check CPU, memory, I/O

# Check slow queries in logs
tail -100 /var/log/postgresql/postgresql.log | grep "duration:"
```

**Common Causes & Fixes:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| One slow query | Missing index | Add index: CREATE INDEX idx_campaign_contact ON campaign_contacts(campaign_id) |
| High CPU | Complex calculation | Offload to worker process |
| High memory | Large dataset in memory | Implement pagination/streaming |
| High I/O | Disk thrashing | Increase cache, reduce query count |

**Immediate Actions:**
```bash
# Scale horizontally
docker-compose up -d --scale app=3

# Clear cache if stale
redis-cli FLUSHALL

# Kill long-running queries
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE query_start < now() - INTERVAL '5 minutes';"
```

---

## 📊 Scaling Playbooks

### Horizontal Scaling (Add More Instances)

**When to scale:**
- CPU usage > 70% for > 5 minutes
- Memory usage > 80%
- Response time > 500ms
- Error rate > 2%

**Scale up:**
```bash
# Scale app instances
docker-compose up -d --scale app=3

# Scale worker instances
docker-compose up -d --scale worker=5

# Verify scaling
docker ps | grep pmp
```

**Scale down:**
```bash
# After traffic returns to normal
docker-compose up -d --scale app=2
docker-compose up -d --scale worker=2
```

### Vertical Scaling (Increase Resources)

**When to use:**
- Single bottleneck component
- Database performance critical
- Redis memory running low

**Database scaling:**
```sql
-- Connect to read replica
ALTER ROLE replication_user CONNECTION LIMIT 1000;

-- Increase work_mem for sorts
ALTER SYSTEM SET work_mem = '256MB';
SELECT pg_reload_conf();
```

**Application scaling:**
```bash
# Increase container memory
docker update --memory 4g app-1
docker update --memory 4g app-2
docker update --memory 4g app-3
```

---

## 🔄 Backup & Recovery

### Automated Backups

**Database Backup (Daily at 2 AM UTC):**
```bash
# Create backup
pg_dump -U postgres -h db -F c production > /backups/prod-$(date +%Y%m%d).dump

# Compress
gzip /backups/prod-*.dump

# Upload to S3
aws s3 cp /backups/prod-*.dump.gz s3://pmp-backups/
```

**Redis Snapshot (Hourly):**
```bash
# Redis automatically saves to /data/dump.rdb
# Copy to backup location
cp /data/dump.rdb /backups/redis-$(date +%Y%m%d-%H%M%S).rdb
aws s3 cp /backups/redis-*.rdb s3://pmp-backups/
```

### Recovery Procedures

**Database Recovery:**
```bash
# Download backup
aws s3 cp s3://pmp-backups/prod-20250115.dump.gz ./

# Decompress
gunzip prod-20250115.dump.gz

# Restore
pg_restore -U postgres -h db -d production prod-20250115.dump
```

**Point-in-Time Recovery (PITR):**
```bash
# PostgreSQL WAL archiving keeps transaction logs
# Restore to specific time
pg_basebackup -h db -D /backup/base -Ft -z -P

# Recover to point in time
recovery_target_timeline = 'latest'
recovery_target_time = '2025-01-15 10:30:00'
```

---

## 🔔 Alerting & Monitoring

### Key Metrics to Monitor

```yaml
metrics:
  - name: API Response Time
    threshold: "< 200ms (p95)"
    alert: "> 500ms"
    
  - name: Error Rate
    threshold: "< 0.5%"
    alert: "> 2%"
    
  - name: Database Connections
    threshold: "< 15/20"
    alert: "> 18/20"
    
  - name: Email Send Rate
    threshold: "1,000 emails/minute"
    alert: "< 100 emails/minute"
    
  - name: Queue Depth
    threshold: "< 1,000"
    alert: "> 5,000"
    
  - name: Memory Usage
    threshold: "< 70%"
    alert: "> 85%"
    
  - name: Disk Usage
    threshold: "< 60%"
    alert: "> 80%"
```

### Alert Configuration

```yaml
alerts:
  - name: HighErrorRate
    condition: error_rate > 0.05
    duration: 5m
    severity: HIGH
    action: page_oncall
    
  - name: SlowDatabaseQueries
    condition: query_time_p95 > 500ms
    duration: 10m
    severity: MEDIUM
    action: notify_slack
    
  - name: LowDiskSpace
    condition: disk_usage > 85%
    duration: 5m
    severity: CRITICAL
    action: page_oncall, create_incident
```

---

## 📋 Post-Incident Review

### Incident Report Template

```markdown
## Incident Report: [Title]

**Incident ID:** INC-001-2025
**Date/Time:** 2025-01-15 10:30 UTC
**Duration:** 45 minutes
**Severity:** CRITICAL
**Status:** RESOLVED

### Timeline
- 10:30 UTC: Email delivery dropped to 0%
- 10:35 UTC: Incident detected
- 10:40 UTC: Root cause identified (API credentials expired)
- 10:45 UTC: Fix deployed
- 11:15 UTC: All systems normal

### Root Cause
API credentials were rotated on security team's schedule but not updated in our environment variables.

### Immediate Actions
1. Updated credentials immediately
2. Tested email delivery
3. Resumed campaign

### Prevention
- [ ] Add automated credential rotation to deployment pipeline
- [ ] Set calendar reminders for credential updates
- [ ] Add monitoring for credential expiration
- [ ] Document credential rotation process

### Follow-up Tasks
- [ ] Update runbook with credential rotation steps
- [ ] Add integration tests for credential validity
- [ ] Schedule security team sync monthly
```

---

## ✅ Operations Checklist

### Weekly
- [ ] Review error logs
- [ ] Check backup success
- [ ] Monitor performance metrics
- [ ] Review incident reports
- [ ] Update runbooks if needed

### Monthly
- [ ] Disaster recovery drill
- [ ] Performance optimization review
- [ ] Capacity planning review
- [ ] Security audit
- [ ] Team training update

### Quarterly
- [ ] Load testing
- [ ] Failover testing
- [ ] Database optimization
- [ ] Infrastructure review
- [ ] Cost analysis

---

*Phase 5: Operations & Incident Response*
*Status: Ready for Implementation*
