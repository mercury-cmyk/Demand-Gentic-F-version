# DemandGentic SIP Server - Complete Deployment Guide

## Overview

This guide provides complete instructions for deploying a dedicated SIP server with:
- **Drachtio-srf**: SIP signaling (INVITE, ACK, BYE, REGISTER, OPTIONS)
- **UDP Ports**: 5060 (SIP), 10000-20000 (RTP/media)
- **STUN/TURN**: Coturn for NAT traversal
- **Public IP**: Static IP address for SDP

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Internet (Public SIP Clients)                               │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │ Public IP:5060/UDP      │
        │ Public IP:10000-20000   │
        │                         │
┌───────▼──────────────────────────────────┐
│ GCP Compute Instance / VM                │
│ ┌──────────────────────────────────────┐ │
│ │ Docker Compose Stack                 │ │
│ │                                      │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ Drachtio SIP Server             │ │ │
│ │ │ - Port 5060/UDP (SIP)           │ │ │
│ │ │ - Port 5061/UDP (SIPS/TLS)      │ │ │
│ │ │ - Command port 9022 (internal)  │ │ │
│ │ └─────────────────────────────────┘ │ │
│ │                                      │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ Coturn TURN/STUN Server         │ │ │
│ │ │ - Port 3478/UDP (TURN)          │ │ │
│ │ │ - Port 5349/UDP (TURNS/TLS)     │ │ │
│ │ └─────────────────────────────────┘ │ │
│ │                                      │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ Node.js Application             │ │ │
│ │ │ - Media processing              │ │ │
│ │ │ - Campaign orchestration        │ │ │
│ │ │ - Gemini API integration        │ │ │
│ │ └─────────────────────────────────┘ │ │
│ │                                      │ │
│ │ ┌──────────────────────────────────┐│
│ │ │ PostgreSQL | Redis               ││
│ │ └──────────────────────────────────┘│
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

---

## Quick Start (Docker)

### Prerequisites

- Docker & Docker Compose installed
- Public static IP address
- Open UDP ports: 5060, 5061, 3478, 5349, 10000-20000

### 1. Setup Environment

```bash
# Create .env.sip file
cat > .env.sip 
PRIVATE_IP=

# Drachtio Configuration
DRACHTIO_HOST=drachtio
DRACHTIO_PORT=9022
SIP_LISTEN_PORT=5060

# STUN/TURN
STUN_SERVERS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
TURN_SERVERS=[{"urls":["turn:coturn:3478"],"username":"turnuser","credential":"turnpass"}]

# API Keys
GEMINI_API_KEY=

# Database
DATABASE_URL=postgresql://user:password@postgres:5432/demandgentic

# Redis
REDIS_URL=redis://redis:6379
EOF
```

### 2. Start Services

```bash
# Start all containers
docker-compose -f docker-compose.sip.yml up -d

# Verify services
docker-compose -f docker-compose.sip.yml ps

# Check logs
docker-compose -f docker-compose.sip.yml logs -f drachtio
docker-compose -f docker-compose.sip.yml logs -f coturn
docker-compose -f docker-compose.sip.yml logs -f app
```

### 3. Verify Connectivity

```bash
# Test SIP port (internal)
docker-compose -f docker-compose.sip.yml exec drachtio netstat -an | grep 5060

# Test TURN port (internal)
docker-compose -f docker-compose.sip.yml exec coturn netstat -an | grep 3478

# Test application health
curl http://localhost:5000/api/health
```

---

## Production Deployment (GCP)

### 1. Prepare Terraform

```bash
cd terraform

# Create terraform.tfvars
cat > terraform.tfvars 

# Performance
max-connections 10000
cps 100

# Logging
log-level info
```

### Coturn Configuration

Located in `coturn.conf`:

```
# Listening
listening-ip=0.0.0.0
listening-port=3478
listening-port=5349
alt-listening-port=3479

# Public IP
external-ip=/

# Auth
user=:
realm=turnserver.example.com

# Resources
max-allocate-lifetime=600
user-quota=100000
total-quota=500000
```

---

## Testing & Validation

### 1. Port Availability

```bash
# External test (from your machine)
timeout 5 bash -c 'cat  /dev/tcp//5060' && echo "SIP port open" || echo "SIP port closed"

# Using netcat (if available)
nc -u -w1  5060 && echo "SIP port open"
```

### 2. STUN Test

```bash
# Using stunclient tool
stunclient  5060

# Expected output should include your external IP
```

### 3. TURN Test

```bash
# Using turnclient
turnclient -v -h  -p 3478 -u turnuser -w turnpass -a 1.2.3.4

# Or use online tools at: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
```

### 4. SIP Registration Test

```bash
# Using SIPp tool
sipp -u user1 -p 5061 -s "sip:user@" :5060
```

### 5. Health Endpoint

```bash
# Check SIP server health
curl http://:5000/api/health

# Expected response:
# {
#   "status": "ok",
#   "sip": {
#     "drachtio": true,
#     "stun": true,
#     "turn": true,
#     "activeCalls": 0
#   }
# }
```

---

## Monitoring & Logs

### Docker Logs

```bash
# All services
docker-compose -f docker-compose.sip.yml logs -f

# Specific service
docker-compose -f docker-compose.sip.yml logs -f drachtio
docker-compose -f docker-compose.sip.yml logs -f coturn
docker-compose -f docker-compose.sip.yml logs -f app
```

### GCP Cloud Logging

```bash
# View logs from Cloud Console
gcloud logging read "resource.type=gce_instance AND resource.labels.instance_id=" --limit 100

# Filter by component
gcloud logging read "logName=projects//logs/demandgentic-sip" --limit 50
```

### Performance Monitoring

```bash
# Check RTP port utilization
curl http://localhost:5000/api/sip/stats | jq '.rtpPorts'

# Check active calls
curl http://localhost:5000/api/sip/calls | jq '.total'

# Check Drachtio connection
curl http://localhost:5000/api/sip/status
```

---

## Troubleshooting

### SIP Calls Not Connecting

1. **Check port availability**
   ```bash
   docker-compose -f docker-compose.sip.yml exec drachtio netstat -tuln | grep 5060
   ```

2. **Check firewall rules**
   ```bash
   gcloud compute firewall-rules list --filter="targetTags:sip-server"
   ```

3. **Check Drachtio logs**
   ```bash
   docker-compose -f docker-compose.sip.yml logs drachtio | grep -i error
   ```

### TURN Not Working

1. **Verify TURN server is running**
   ```bash
   docker-compose -f docker-compose.sip.yml exec coturn netstat -tuln | grep 3478
   ```

2. **Check TURN credentials**
   ```bash
   docker-compose -f docker-compose.sip.yml exec coturn turnutils_uclient -v -h coturn -u turnuser -w turnpass
   ```

3. **Check external IP configuration**
   ```bash
   docker-compose -f docker-compose.sip.yml exec coturn cat /etc/coturn/turnserver.conf | grep "external-ip"
   ```

### High Latency or Packet Loss

1. **Monitor RTP ports**
   ```bash
   docker-compose -f docker-compose.sip.yml exec app curl localhost:5000/api/sip/stats
   ```

2. **Check CPU/Memory**
   ```bash
   docker stats
   ```

3. **Verify machine type is sufficient** (recommend e2-standard-4 or higher)

---

## Scaling & High Availability

### Multiple SIP Servers

For high availability, deploy multiple SIP servers with:
- Load balancer (GCP Network LB)
- DNS round-robin to public IPs
- Shared database (PostgreSQL)
- Shared cache (Redis)

### Terraform Configuration

```hcl
# Create multiple instances
count = var.instance_count  # Set to 3+ for HA

# Use load balancer
resource "google_compute_backend_service" "sip" {
  name = "sip-backend"
  protocol = "UDP"
  health_checks = [google_compute_health_check.sip.id]
}

# Configure health checks
resource "google_compute_health_check" "sip" {
  name = "sip-health-check"
  timeout_sec = 10
  check_interval_sec = 30
  
  http_health_check {
    port = 5000
    request_path = "/api/health"
  }
}
```

---

## Security Considerations

### Network Security

- Restrict SSH access to your IP: `ssh_source_cidr = "YOUR_IP/32"`
- Use VPC for database/Redis (not exposed to internet)
- Enable VPC Service Controls for GCP resources

### TURN Server Security

- Use strong credentials: `TURN_PASSWORD` (minimum 32 characters)
- Rotate credentials periodically
- Monitor TURN server logs for abuse
- Implement rate limiting

### TLS/DTLS

- Generate and use proper DTLS certificates
- Configure SIPS on port 5061
- Use TLS for Coturn (port 5349)

### Application Security

- Run containers as non-root user
- Use secret management (GCP Secret Manager)
- Enable audit logging
- Implement rate limiting on API endpoints

---

## Cost Optimization

### GCP Resources

| Resource | Estimated Cost (monthly) | Notes |
|----------|--------------------------|-------|
| e2-standard-4 instance | $90-120 | Adjust machine type as needed |
| Cloud SQL (db-f1-micro) | $10-15 | Pre-production; scale up for prod |
| Cloud Redis (1GB) | $30-40 | Use for session cache |
| Network Egress | $0.12/GB | Depends on call volume |

### Cost Reduction

1. **Use smaller instances** for low-volume testing (e2-medium: ~$35/month)
2. **Autoscaling**: Add/remove instances based on call volume
3. **Spot instances**: Use GCP Spot VM for dev/test (70% discount)
4. **Reserved instances**: Pre-purchase for production (25-30% discount)

---

## Next Steps

1. **Deploy test instance** using Docker for validation
2. **Set up monitoring** with Cloud Logging and Cloud Monitoring
3. **Configure DNS** (SRV records for SIP)
4. **Implement call logging** for analytics
5. **Set up backup/recovery** procedures
6. **Load test** with tools like SIPp
7. **Deploy to production** with HA configuration

---

## Support & Resources

- [Drachtio Documentation](https://drachtio.org/)
- [Coturn Documentation](https://github.com/coturn/coturn)
- [RFC 3261 - SIP Protocol](https://tools.ietf.org/html/rfc3261)
- [RFC 5245 - ICE Protocol](https://tools.ietf.org/html/rfc5245)
- [RFC 5389 - STUN Protocol](https://tools.ietf.org/html/rfc5389)
- [RFC 5766 - TURN Protocol](https://tools.ietf.org/html/rfc5766)