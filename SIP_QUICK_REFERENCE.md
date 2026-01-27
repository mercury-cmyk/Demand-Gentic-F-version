# SIP Server Quick Reference

## File Structure

```
demandgentic-ai/
├── server/services/sip/
│   ├── drachtio-server.ts      # Main Drachtio SIP server
│   ├── ice-config.ts            # STUN/TURN configuration
│   ├── port-config.ts           # Port allocation & firewall
│   ├── sip-init.ts              # SIP initialization
│   ├── sip-dialer.ts            # Outbound calling (existing)
│   └── sip-client.ts            # SIP client (existing)
│
├── terraform/
│   ├── main.tf                  # GCP infrastructure
│   ├── variables.tf             # Terraform variables
│   └── startup.sh               # VM startup script
│
├── .env.sip.example             # Environment template
├── Dockerfile.sip               # Docker image for SIP server
├── docker-compose.sip.yml       # Complete stack (Drachtio + Coturn + App)
├── SIP_DEPLOYMENT_GUIDE.md      # Complete documentation
└── package.json                 # Updated with SIP dependencies

```

## Quick Commands

### Local Development (Docker)

```bash
# Setup
cp .env.sip.example .env.sip
# Edit .env.sip with your settings

# Start services
docker-compose -f docker-compose.sip.yml up -d

# Check status
docker-compose -f docker-compose.sip.yml ps

# View logs
docker-compose -f docker-compose.sip.yml logs -f

# Stop services
docker-compose -f docker-compose.sip.yml down
```

### Production Deployment (GCP)

```bash
# Initialize Terraform
cd terraform
terraform init

# Create tfvars file
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Plan and apply
terraform plan -out=tfplan
terraform apply tfplan

# Get outputs
terraform output sip_server_public_ip
```

### Testing & Validation

```bash
# Test SIP connectivity
curl http://localhost:5000/api/health

# Check SIP stats
curl http://localhost:5000/api/sip/stats

# View active calls
curl http://localhost:5000/api/sip/calls

# Check port availability
npm run sip:validate
```

## Key Configuration

| Variable | Value | Purpose |
|----------|-------|---------|
| `PUBLIC_IP` | Your public IP | For SDP media direction |
| `DRACHTIO_HOST` | drachtio (Docker) | Drachtio server hostname |
| `SIP_LISTEN_PORT` | 5060 | SIP signaling port |
| `RTP_PORT_MIN/MAX` | 10000-20000 | Media stream ports |
| `STUN_SERVERS` | Google STUN | NAT traversal (STUN) |
| `TURN_SERVERS` | Coturn | NAT traversal (TURN) |
| `USE_SIP_CALLING` | true | Enable SIP feature |

## Architecture Components

### 1. Drachtio SIP Server
- **Role**: SIP signaling (INVITE, ACK, BYE, REGISTER)
- **Ports**: 5060/UDP (SIP), 5061/UDP (SIPS)
- **Command Port**: 9022 (internal)
- **Image**: drachtio/drachtio-server

### 2. Coturn TURN/STUN Server
- **Role**: Media relay for NAT traversal
- **Ports**: 3478/UDP (TURN), 5349/UDP (TURNS)
- **Credentials**: turnuser/turnpass (configurable)
- **Image**: coturn/coturn

### 3. Node.js Application
- **Role**: SIP client, media processing, campaign orchestration
- **Ports**: 5000 (HTTP), 10000-20000 (RTP)
- **Integrations**: Drachtio, Gemini API, PostgreSQL, Redis
- **Build**: Dockerfile.sip

## Port Requirements

| Protocol | Port | Direction | Purpose |
|----------|------|-----------|---------|
| UDP | 5060 | Inbound | SIP signaling |
| UDP | 5061 | Inbound | SIPS (TLS) |
| UDP | 3478 | Inbound | TURN media |
| UDP | 5349 | Inbound | TURNS (TLS) |
| UDP | 10000-20000 | Inbound/Outbound | RTP media |

### GCP Firewall

```bash
# SIP signaling
gcloud compute firewall-rules create sip-allow-sip \
  --allow=udp:5060-5061 --source-ranges=0.0.0.0/0 --target-tags=sip-server

# RTP media
gcloud compute firewall-rules create sip-allow-rtp \
  --allow=udp:10000-20000 --source-ranges=0.0.0.0/0 --target-tags=sip-server

# TURN server
gcloud compute firewall-rules create sip-allow-turn \
  --allow=udp:3478,tcp:3478,udp:5349,tcp:5349 \
  --source-ranges=0.0.0.0/0 --target-tags=turn-server
```

## Troubleshooting

### SIP Not Working
1. Check public IP: `echo $PUBLIC_IP`
2. Verify port open: `nc -u -w1 <PUBLIC_IP> 5060`
3. Check logs: `docker-compose -f docker-compose.sip.yml logs drachtio`

### TURN Not Working
1. Verify running: `docker-compose -f docker-compose.sip.yml exec coturn netstat -tuln | grep 3478`
2. Test with: `turnclient -h <PUBLIC_IP> -p 3478 -u turnuser -w turnpass`
3. Check config: `docker-compose -f docker-compose.sip.yml exec coturn cat /etc/coturn/turnserver.conf`

### High Latency
1. Check RTP utilization: `curl localhost:5000/api/sip/stats`
2. Monitor: `docker stats`
3. Scale up: Consider larger machine type (e2-standard-4 minimum)

## Integration Points

### SIP Dialer API

```typescript
import { drachtioServer } from '@/services/sip/drachtio-server';

// Initiate call
const callId = await drachtioServer.initiateCall({
  to: '+1234567890',
  from: '+0987654321',
  campaignId: 'camp-123',
  contactId: 'contact-456',
});

// End call
await drachtioServer.endCall(callId);

// Get stats
const stats = drachtioServer.getStats();
```

### Health Endpoint

```bash
GET /api/health

# Response
{
  "status": "ok",
  "sip": {
    "drachtio": true,
    "stun": true,
    "turn": true,
    "activeCalls": 5,
    "ports": { "used": 10, "total": 10001, "percentage": 0.1 }
  }
}
```

## Security Checklist

- [ ] Change TURN credentials (`TURN_USERNAME`, `TURN_PASSWORD`)
- [ ] Restrict SSH access: `ssh_source_cidr = "YOUR_IP/32"`
- [ ] Use strong JWT secret
- [ ] Enable VPC for database/Redis
- [ ] Configure SSL/TLS certificates
- [ ] Enable audit logging
- [ ] Rotate credentials periodically
- [ ] Use Secret Manager for sensitive data

## Performance Tuning

### For Low Load (< 10 calls)
- Machine: e2-medium (2 vCPU, 4 GB RAM) - ~$35/month
- Database: db-f1-micro
- Redis: 1 GB

### For Medium Load (10-100 calls)
- Machine: e2-standard-4 (4 vCPU, 16 GB RAM) - ~$120/month
- Database: db-g1-small
- Redis: 2-4 GB

### For High Load (100+ calls)
- Machine: n2-standard-8+ with autoscaling
- Database: High-availability PostgreSQL
- Redis: Redis Cluster
- Load balancer: Network LB

## Cost Estimate (GCP)

| Resource | Low | Medium | High |
|----------|-----|--------|------|
| Compute | $35 | $120 | $500+ |
| Database | $10 | $50 | $200+ |
| Redis | $30 | $60 | $150+ |
| Network | $5 | $20 | $100+ |
| **Total** | **$80** | **$250** | **$950+** |

## Next Steps

1. [ ] Deploy test instance with Docker
2. [ ] Configure static IP
3. [ ] Test SIP connectivity
4. [ ] Deploy Terraform for production
5. [ ] Set up monitoring/alerting
6. [ ] Load test with SIPp
7. [ ] Configure DNS/SRV records
8. [ ] Enable backup/DR

## Resources

- [Drachtio Docs](https://drachtio.org/)
- [Coturn Docs](https://github.com/coturn/coturn)
- [RFC 3261 (SIP)](https://tools.ietf.org/html/rfc3261)
- [RFC 5245 (ICE)](https://tools.ietf.org/html/rfc5245)
- [GCP VPC Networks](https://cloud.google.com/vpc/docs)
- [Terraform Google Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
