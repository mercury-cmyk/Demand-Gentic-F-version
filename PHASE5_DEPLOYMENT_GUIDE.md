# Phase 5: Deployment Guide

## 🚀 Production Deployment Strategy

### Deployment Environments

```
Development (Local)
    ↓
Staging (Pre-production)
    ↓
Production (Live)
```

---

## 📋 Pre-Deployment Checklist

### Code Quality
- [ ] All tests passing (80%+ coverage)
- [ ] No console errors/warnings
- [ ] ESLint compliant
- [ ] TypeScript strict mode enabled
- [ ] No hardcoded secrets

### Performance
- [ ] Bundle size < 500KB (gzipped)
- [ ] API response time < 200ms
- [ ] Email rendering < 100ms per email
- [ ] Database queries optimized
- [ ] Caching configured

### Security
- [ ] Environment variables secured
- [ ] SSL/TLS certificate valid
- [ ] SQL injection protection verified
- [ ] XSS protection enabled
- [ ] CORS properly configured

### Infrastructure
- [ ] Database backups configured
- [ ] Redis persistence enabled
- [ ] Logging setup complete
- [ ] Monitoring alerts configured
- [ ] Disaster recovery plan

---

## 🐳 Docker Setup

### Build Production Image
```bash
docker build -f Dockerfile.production -t pmp:latest .
```

### Push to Registry
```bash
docker tag pmp:latest your-registry/pmp:latest
docker push your-registry/pmp:latest
```

### Docker Compose (Development)
```bash
docker-compose -f docker-compose.yml up -d
```

### Docker Compose (Production)
```bash
docker-compose -f docker-compose.production.yml up -d
```

---

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

**File**: `.github/workflows/deploy.yml`

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: docker build -f Dockerfile.production -t pmp:${{ github.sha }} .
      - name: Push to registry
        run: |
          echo ${{ secrets.REGISTRY_PASSWORD }} | docker login -u ${{ secrets.REGISTRY_USER }} --password-stdin
          docker push pmp:${{ github.sha }}
      - name: Deploy to production
        run: |
          ssh -i ${{ secrets.SSH_KEY }} ${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }} \
            'cd /app && docker-compose pull && docker-compose up -d'
```

---

## 📦 Environment Configuration

### Development (.env.development)
```bash
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pivotal_marketing_dev
REDIS_URL=redis://localhost:6379
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=your_mailtrap_user
SMTP_PASS=your_mailtrap_pass
```

### Staging (.env.staging)
```bash
NODE_ENV=staging
DATABASE_URL=postgresql://user:pass@staging-db:5432/pivotal_marketing
REDIS_URL=redis://staging-redis:6379
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_key
ELASTICSEARCH_URL=http://staging-es:9200
```

### Production (.env.production)
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-db:5432/pivotal_marketing
REDIS_URL=redis://prod-redis:6379
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_key
ELASTICSEARCH_URL=http://prod-es:9200
LOG_LEVEL=info
```

---

## 🗄️ Database Setup

### Initial Setup
```bash
# Run migrations
npm run migrate

# Seed initial data
npm run seed:production
```

### Backup Strategy
```bash
# Daily backup
pg_dump $DATABASE_URL | gzip > backups/db-$(date +%Y%m%d).sql.gz

# Backup schedule (cron)
0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/db-$(date +%Y%m%d).sql.gz
```

### Recovery
```bash
# Restore from backup
gunzip -c backups/db-20250101.sql.gz | psql $DATABASE_URL
```

---

## 🔐 SSL/TLS Setup

### Let's Encrypt
```bash
# Install certbot
apt-get install certbot python3-certbot-nginx

# Generate certificate
certbot certonly --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
certbot renew --dry-run
```

### Nginx Configuration
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 📊 Monitoring & Alerting

### Health Checks
```typescript
// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
```

### Prometheus Metrics
```typescript
import { Registry, Counter, Histogram } from 'prom-client';

const register = new Registry();

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route']
});
```

### Alert Rules
```yaml
# alert.rules.yml
groups:
  - name: application
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected"

      - alert: DatabaseConnectionFailed
        expr: up{job="postgres"} == 0
        for: 1m
        annotations:
          summary: "Database connection failed"

      - alert: HighCPUUsage
        expr: process_cpu_seconds_total > 0.8
        for: 5m
        annotations:
          summary: "High CPU usage detected"
```

---

## 📈 Performance Monitoring

### New Relic Integration
```typescript
require('newrelic');
import express from 'express';

const app = express();

// All routes will be automatically monitored
```

### DataDog Integration
```typescript
const tracer = require('dd-trace').init();
const StatsD = require('node-statsd').StatsD;

const dogstatsd = new StatsD({
  host: 'localhost',
  port: 8125
});

// Track custom metrics
dogstatsd.gauge('campaign.queue_size', queueSize);
dogstatsd.increment('email.sent');
```

---

## 🔄 Scaling Strategy

### Horizontal Scaling
```yaml
# Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pmp-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: pmp
  template:
    metadata:
      labels:
        app: pmp
    spec:
      containers:
      - name: app
        image: pmp:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: pmp-secrets
              key: database-url
```

### Load Balancing
```nginx
upstream app {
  least_conn;
  server app1:3000;
  server app2:3000;
  server app3:3000;
}

server {
  listen 80;
  location / {
    proxy_pass http://app;
  }
}
```

### Auto-Scaling
```yaml
# Kubernetes HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: pmp-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: pmp-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## 🚨 Incident Response

### Critical Issues
1. Database down → Failover to replica
2. Email queue full → Scale workers
3. Memory leak → Restart service
4. Rate limiting → Check attack patterns
5. Email not sending → Check SMTP status

### Rollback Procedure
```bash
# Rollback to previous version
docker-compose down
docker pull pmp:previous-tag
docker-compose up -d

# Verify deployment
curl http://localhost:3000/health
```

---

## 📝 Deployment Checklist

### Pre-Deployment
- [ ] Code review completed
- [ ] Tests passing (80%+)
- [ ] Database migrations prepared
- [ ] Environment variables confirmed
- [ ] SSL certificates valid
- [ ] Backups verified
- [ ] Monitoring configured
- [ ] Runbook reviewed

### Deployment
- [ ] Backup current database
- [ ] Pull latest code
- [ ] Run migrations
- [ ] Build Docker image
- [ ] Push to registry
- [ ] Pull image on production
- [ ] Start services
- [ ] Verify health checks
- [ ] Test critical paths

### Post-Deployment
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify email delivery
- [ ] Monitor database performance
- [ ] Check log aggregation
- [ ] User feedback collection
- [ ] Update runbook with learnings

---

## 🔗 Deployment Links

- **Production URL**: https://yourdomain.com
- **Staging URL**: https://staging.yourdomain.com
- **Prometheus**: http://prometheus:9090
- **Grafana**: http://grafana:3000
- **Kibana**: http://kibana:5601
- **SSH Access**: ssh app@prod-server.com

---

## 📞 Support

For deployment issues:
1. Check health endpoint: `curl http://localhost:3000/health`
2. Review logs: `docker-compose logs -f app`
3. Check database: `psql $DATABASE_URL`
4. Monitor metrics: Check Prometheus/Grafana
5. Review runbook: `PHASE5_OPERATIONS_RUNBOOK.md`

---

*Phase 5: Production Deployment*
*Status: Ready for Deployment*
