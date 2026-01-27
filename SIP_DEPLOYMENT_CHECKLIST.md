# SIP Server Deployment Checklist

## Pre-Deployment Requirements

### Infrastructure Requirements
- [ ] **Static Public IP Address**
  - GCP: Allocated via Terraform
  - AWS: Use Elastic IP
  - Other: Reserve static IP with ISP

- [ ] **Open UDP Ports (Firewall)**
  - [ ] 5060/UDP (SIP signaling)
  - [ ] 5061/UDP (SIPS - optional)
  - [ ] 3478/UDP (TURN)
  - [ ] 5349/UDP (TURNS - optional)
  - [ ] 10000-20000/UDP (RTP media)

- [ ] **DNS Configuration** (optional)
  - [ ] SRV record: `_sip._udp.example.com` → SIP server
  - [ ] A record: `sip.example.com` → Public IP
  - [ ] NAPTR records (optional)

### API Keys & Credentials
- [ ] **Gemini API Key**
  - Get from: Google Cloud Console → APIs & Services → Credentials
  - Store in Secret Manager (not in code)

- [ ] **Database Credentials**
  - [ ] PostgreSQL user and password
  - [ ] Database name: `demandgentic`
  - [ ] Consider: Cloud SQL, AWS RDS, or self-hosted

- [ ] **Redis Credentials**
  - [ ] Redis URL and password (if required)
  - [ ] Consider: Cloud Redis, Elasticache, or self-hosted

- [ ] **TURN Server Credentials**
  - [ ] TURN username (generate strong random)
  - [ ] TURN password (minimum 32 characters)
  - [ ] Example: `openssl rand -base64 32`

## Local Testing (Docker)

### 1. Environment Setup
- [ ] Copy `.env.sip.example` to `.env.sip`
- [ ] Edit `.env.sip` with test values:
  ```
  PUBLIC_IP=127.0.0.1  (or your test IP)
  DRACHTIO_HOST=drachtio
  TURN_USERNAME=testuser
  TURN_PASSWORD=testpass123
  GEMINI_API_KEY=<test-key>
  DATABASE_URL=postgresql://postgres:postgres@postgres:5432/demandgentic
  REDIS_URL=redis://redis:6379
  ```
- [ ] Verify all required variables are set

### 2. Docker Compose
- [ ] Install Docker and Docker Compose
- [ ] Build images: `docker-compose -f docker-compose.sip.yml build`
- [ ] Start services: `docker-compose -f docker-compose.sip.yml up -d`
- [ ] Wait for initialization: `sleep 30`

### 3. Service Verification
- [ ] Check containers running: `docker-compose -f docker-compose.sip.yml ps`
- [ ] Verify Drachtio: `docker-compose -f docker-compose.sip.yml exec drachtio netstat -an | grep 5060`
- [ ] Verify Coturn: `docker-compose -f docker-compose.sip.yml exec coturn netstat -an | grep 3478`
- [ ] Check application: `curl http://localhost:5000/api/health`
- [ ] Review logs: `docker-compose -f docker-compose.sip.yml logs --tail=50`

### 4. Local Testing
- [ ] Test SIP connectivity (internal): `docker-compose -f docker-compose.sip.yml exec drachtio netstat -tuln`
- [ ] Test TURN (internal): `docker-compose -f docker-compose.sip.yml exec coturn turnutils_uclient -v`
- [ ] Check health endpoint: `curl localhost:5000/api/health`
- [ ] Check SIP stats: `curl localhost:5000/api/sip/stats`

## Production Deployment (GCP)

### 1. GCP Setup
- [ ] Create GCP Project
  - [ ] Enable APIs:
    - [ ] Compute Engine
    - [ ] Cloud SQL
    - [ ] Cloud Redis
    - [ ] Cloud Logging
    - [ ] Cloud Monitoring
  - [ ] Set billing account

- [ ] Create Cloud SQL Database
  - [ ] Instance type: db-f1-micro (dev) or higher
  - [ ] Database name: `demandgentic`
  - [ ] User credentials: (save securely)
  - [ ] Enable backups
  - [ ] Store connection string for `DATABASE_URL`

- [ ] Create Cloud Redis Instance
  - [ ] Size: 1 GB minimum
  - [ ] Tier: STANDARD_HA
  - [ ] VPC: Create dedicated VPC
  - [ ] Store connection URL for `REDIS_URL`

### 2. Terraform Configuration
- [ ] Copy `terraform/terraform.tfvars.example` to `terraform/terraform.tfvars`
- [ ] Fill in all required values:
  - [ ] `gcp_project_id`
  - [ ] `gcp_region`
  - [ ] `machine_type` (e2-standard-4 recommended)
  - [ ] `ssh_source_cidr` (restrict to your IP!)
  - [ ] `github_token`
  - [ ] `gemini_api_key`
  - [ ] `database_url`
  - [ ] `redis_url`
  - [ ] `turn_username`
  - [ ] `turn_password`
  - [ ] `db_password`
- [ ] Review values: `cat terraform/terraform.tfvars`

### 3. Terraform Deployment
- [ ] Install Terraform (v1.0+)
- [ ] Initialize: `cd terraform && terraform init`
- [ ] Plan: `terraform plan -out=tfplan`
  - [ ] Review resource creation carefully
  - [ ] Check costs: `terraform estimate`
- [ ] Apply: `terraform apply tfplan`
  - [ ] Wait for completion (5-10 minutes)
  - [ ] Save output IPs

### 4. Output Verification
```bash
terraform output sip_server_public_ip
terraform output database_connection_name
terraform output redis_host
terraform output redis_port
```
- [ ] Record all outputs
- [ ] Test connectivity to instance

### 5. Instance Verification
- [ ] SSH into instance: `gcloud compute ssh demandgentic-sip-server --zone us-central1-a`
- [ ] Verify Docker installation: `docker --version`
- [ ] Verify Docker Compose: `docker-compose --version`
- [ ] Check startup logs: `tail -100 /var/log/demandgentic-startup.log`
- [ ] Verify containers:
  ```bash
  docker-compose -f /opt/demandgentic/docker-compose.sip.yml ps
  docker-compose -f /opt/demandgentic/docker-compose.sip.yml logs --tail=50
  ```

### 6. External Connectivity Testing
- [ ] Get public IP: `gcloud compute addresses describe sip-server-static-ip --region us-central1`
- [ ] Test SIP port (from external machine):
  ```bash
  timeout 5 bash -c 'cat < /dev/null > /dev/udp/<PUBLIC_IP>/5060' 2>/dev/null && echo "SIP OK" || echo "SIP FAILED"
  ```
- [ ] Test TURN port:
  ```bash
  nc -u -w1 <PUBLIC_IP> 3478 < /dev/null && echo "TURN OK" || echo "TURN FAILED"
  ```
- [ ] Test application:
  ```bash
  curl http://<PUBLIC_IP>:5000/api/health
  curl http://<PUBLIC_IP>:5000/api/sip/stats
  ```

## Firewall Verification (GCP)

- [ ] List firewall rules: `gcloud compute firewall-rules list --filter="targetTags:sip-server"`
- [ ] Verify SIP rule: Should allow 5060-5061/UDP from 0.0.0.0/0
- [ ] Verify RTP rule: Should allow 10000-20000/UDP from 0.0.0.0/0
- [ ] Verify TURN rule: Should allow 3478/UDP and 5349/UDP from 0.0.0.0/0
- [ ] Verify SSH rule: Should restrict to your IP only

## Security Hardening

### Network Security
- [ ] Restrict SSH source: `ssh_source_cidr = "YOUR_IP/32"` (CRITICAL!)
- [ ] Verify only required ports open
- [ ] Private database/Redis (not internet-facing)
- [ ] Use Cloud SQL with SSL/TLS required

### Credentials & Secrets
- [ ] Generate strong TURN password: `openssl rand -base64 32`
- [ ] Generate strong DB password: `openssl rand -base64 32`
- [ ] Store secrets in GCP Secret Manager:
  ```bash
  echo -n "YOUR_PASSWORD" | gcloud secrets create turn-password --data-file=-
  echo -n "YOUR_GEMINI_KEY" | gcloud secrets create gemini-api-key --data-file=-
  ```
- [ ] Never commit `.env.sip` or `terraform.tfvars` to git
- [ ] Add to `.gitignore`:
  ```
  .env.sip
  terraform/terraform.tfvars
  terraform/tfplan
  ```

### Container Security
- [ ] Verify non-root user in Dockerfile.sip
- [ ] Run security scan: `docker run --rm aquasec/trivy image demandgentic-sip:latest`
- [ ] Regular image updates: `docker pull <base-images>`

## Monitoring & Logging

### Cloud Logging
- [ ] View instance logs:
  ```bash
  gcloud logging read "resource.type=gce_instance AND resource.labels.instance_id=<INSTANCE_ID>" --limit=50
  ```
- [ ] Filter by component:
  ```bash
  gcloud logging read "resource.labels.instance_id=<INSTANCE_ID> AND jsonPayload.component=drachtio" --limit=20
  ```

### Cloud Monitoring
- [ ] Create dashboard:
  - [ ] CPU usage
  - [ ] Memory usage
  - [ ] Network traffic
  - [ ] Active calls count

- [ ] Create alerts:
  - [ ] CPU > 80% for 5 minutes
  - [ ] Memory > 90%
  - [ ] Drachtio connection down
  - [ ] SIP errors > threshold

### Application Health
- [ ] Set up continuous health checks:
  ```bash
  while true; do
    curl -s http://<PUBLIC_IP>:5000/api/health | jq .
    sleep 60
  done
  ```

## Performance Validation

### Load Testing
- [ ] Install SIPp: `apt-get install sipp`
- [ ] Run basic test:
  ```bash
  sipp -u user1 -s "sip:user@<PUBLIC_IP>:5060" -r 10 <PUBLIC_IP>
  ```
- [ ] Monitor during test:
  - [ ] CPU usage: `top`
  - [ ] Memory: `free -h`
  - [ ] Network: `iftop` or `netstat -i`
  - [ ] SIP stats: `curl http://localhost:5000/api/sip/stats`

### Stress Testing
- [ ] Increase call rate gradually
- [ ] Monitor system resources
- [ ] Check for errors in logs
- [ ] Verify audio quality (if applicable)

## Backup & Disaster Recovery

### Database Backup
- [ ] Enable automated backups (Cloud SQL)
- [ ] Test restore procedure
- [ ] Store backup in separate region
- [ ] Document RTO/RPO

### Configuration Backup
- [ ] Backup Terraform state: `gsutil cp gs://bucket/tfstate .`
- [ ] Store `.env.sip` in Secret Manager
- [ ] Document all manual configurations

## DNS Configuration (Optional)

- [ ] Create SRV record (if using DNS for SIP):
  ```
  _sip._udp.example.com SRV 10 60 5060 sip.example.com
  ```
- [ ] Create A record:
  ```
  sip.example.com A <PUBLIC_IP>
  ```
- [ ] Test DNS: `nslookup sip.example.com`

## Documentation & Runbooks

- [ ] Create operational runbook
- [ ] Document troubleshooting steps
- [ ] Create incident response procedures
- [ ] Document escalation contacts
- [ ] Maintain deployment notes

## Go-Live Checklist

- [ ] All services verified running
- [ ] External connectivity confirmed
- [ ] Monitoring and alerts configured
- [ ] Team trained on operations
- [ ] Runbooks available
- [ ] Backup procedures tested
- [ ] Security audit completed
- [ ] Performance baselines established
- [ ] Stakeholders notified
- [ ] Rollback plan in place

---

## Post-Deployment Tasks

### Week 1
- [ ] Monitor error logs continuously
- [ ] Verify call quality
- [ ] Test edge cases (NAT, firewalls, etc.)
- [ ] Gather performance metrics

### Month 1
- [ ] Analyze usage patterns
- [ ] Optimize resource allocation
- [ ] Scale if needed
- [ ] Refine monitoring

### Quarter 1
- [ ] Security audit
- [ ] Disaster recovery drill
- [ ] Performance review
- [ ] Plan HA/multi-region

---

## Quick Rollback Plan

If issues arise:

1. **Immediate**: Shut down new infrastructure
   ```bash
   terraform destroy -auto-approve  # Or manually via GCP Console
   ```

2. **DNS Failover**: Point DNS to old system
   ```bash
   # Update DNS records if using DNS failover
   ```

3. **Restore from Backup**: Restore database/configs
   ```bash
   gcloud sql backups restore <BACKUP_ID> --instance=demandgentic-postgres
   ```

---

## Support Contacts

- **Drachtio Issues**: https://github.com/drachtio/drachtio-server/issues
- **Coturn Issues**: https://github.com/coturn/coturn/issues
- **GCP Support**: https://cloud.google.com/support
- **Internal Team**: [Your team contact info]

---

**Deployment Date**: _______________  
**Deployed By**: _______________  
**Public IP**: _______________  
**Terraform State Location**: _______________  
**Database Connection**: _______________  
**Redis Connection**: _______________  

---

✅ **Ready for Deployment!**
