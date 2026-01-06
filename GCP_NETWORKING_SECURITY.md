# GCP Networking, Domains & Security Setup

This document covers custom domain mapping, TLS/SSL, VPC configuration, and IAM for production deployment.

## 🌐 Custom Domain Mapping

### Prerequisites
- A registered domain name
- DNS access to your domain registrar
- Cloud Run service already deployed

### Steps

#### 1. Reserve Static IP (Optional but Recommended)
```bash
PROJECT_ID="pivotalcrm-2026"
REGION="us-central1"

# Reserve a static IP
gcloud compute addresses create pivotal-ip \
  --global \
  --project=$PROJECT_ID

# Get the IP
STATIC_IP=$(gcloud compute addresses describe pivotal-ip \
  --global \
  --format='value(address)' \
  --project=$PROJECT_ID)

echo "Static IP: $STATIC_IP"
```

#### 2. Configure Domain Mapping
```bash
SERVICE="pivotalcrm-service"
DOMAIN="crm.yourdomain.com"

# Create domain mapping
gcloud run domain-mappings create \
  --service=$SERVICE \
  --domain=$DOMAIN \
  --region=$REGION \
  --project=$PROJECT_ID
```

#### 3. Update DNS Records
Get the mapped DNS name:
```bash
gcloud run domain-mappings describe $DOMAIN \
  --format='value(status.resourceRecords)' \
  --project=$PROJECT_ID
```

Add these DNS records to your registrar:
- **CNAME**: `crm.yourdomain.com` → `ghs.googlehosted.com`
  (Replace with the name provided by gcloud)

Or if using static IP:
- **A**: `crm.yourdomain.com` → `<STATIC_IP>`

**Note**: DNS propagation can take 15-60 minutes.

#### 4. Verify Domain Mapping
```bash
# Check mapping status
gcloud run domain-mappings describe $DOMAIN \
  --project=$PROJECT_ID

# Test with curl
curl https://$DOMAIN/api/health
```

---

## 🔒 TLS/SSL Certificates

Cloud Run automatically provisions managed SSL certificates for mapped domains.

### Verify Certificate
```bash
# Check certificate status
gcloud run domain-mappings describe crm.yourdomain.com \
  --format='value(status.resourceRecords.@type="MX")' \
  --project=$PROJECT_ID
```

### Update Application Base URL
After domain is live, update secrets:

```bash
# Update APP_BASE_URL to use your domain
gcloud secrets versions add APP_BASE_URL --data-file=- <<< "https://crm.yourdomain.com"

# Update Telnyx webhook URL
gcloud secrets versions add TELNYX_WEBHOOK_URL --data-file=- <<< "https://crm.yourdomain.com/webhooks/telnyx"

# Redeploy to use new secrets
./scripts/deploy-to-cloud-run.sh
```

---

## 🔗 VPC & Private Networking

### When to Use VPC
- Connecting to Cloud SQL (private IP)
- Connecting to Cloud Memorystore (requires VPC connector)
- Running completely private services

### Create VPC Connector
```bash
PROJECT_ID="pivotalcrm-2026"
REGION="us-central1"
CONNECTOR_NAME="pivotal-connector"

gcloud compute networks vpc-access connectors create $CONNECTOR_NAME \
  --region=$REGION \
  --subnet=default \
  --min-instances=2 \
  --max-instances=10 \
  --project=$PROJECT_ID
```

### Update Cloud Run with VPC
```bash
SERVICE="pivotalcrm-service"

gcloud run services update $SERVICE \
  --vpc-connector=$CONNECTOR_NAME \
  --vpc-egress=private-ranges-only \
  --region=$REGION \
  --project=$PROJECT_ID
```

### Verify VPC Connection
```bash
# Check Cloud Run service configuration
gcloud run services describe $SERVICE \
  --region=$REGION \
  --format='value(spec.template.spec.vpcAccess)' \
  --project=$PROJECT_ID
```

---

## 👥 IAM & Service Accounts

### Service Account Setup
```bash
PROJECT_ID="pivotalcrm-2026"
SA_NAME="pivotal-app"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# Create service account
gcloud iam service-accounts create $SA_NAME \
  --display-name="Pivotal CRM Application" \
  --project=$PROJECT_ID

# Grant Cloud Run service account permission to use Cloud SQL
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/cloudsql.client" \
  --quiet

# Grant Secret Manager access
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

# Grant Cloud Storage access (for file uploads)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.objectAdmin" \
  --quiet
```

### Assign Service Account to Cloud Run
```bash
gcloud run services update $SERVICE \
  --service-account=$SA_EMAIL \
  --region=$REGION \
  --project=$PROJECT_ID
```

---

## 📂 Cloud Storage Setup (Optional)

If using Cloud Storage for file uploads instead of S3:

### Create GCS Bucket
```bash
BUCKET_NAME="pivotal-crm-files"
REGION="us-central1"

gcloud storage buckets create gs://$BUCKET_NAME \
  --location=$REGION \
  --project=$PROJECT_ID \
  --uniform-bucket-level-access

# Configure CORS for direct browser uploads
cat > cors.json << 'EOF'
[
  {
    "origin": ["https://crm.yourdomain.com"],
    "method": ["GET", "HEAD", "DELETE"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
EOF

gcloud storage buckets update gs://$BUCKET_NAME \
  --cors-file=cors.json \
  --project=$PROJECT_ID

# Grant Cloud Run service account access
gcloud storage buckets add-iam-policy-binding gs://$BUCKET_NAME \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.objectAdmin" \
  --project=$PROJECT_ID
```

### Update Application Config
```bash
# Store GCS bucket name in secrets
gcloud secrets create GCS_BUCKET --data-file=- <<< "gs://$BUCKET_NAME"

# Or use environment variable
gcloud run services update $SERVICE \
  --set-env-vars="GCS_BUCKET=$BUCKET_NAME" \
  --region=$REGION \
  --project=$PROJECT_ID
```

---

## 🔐 Cloud Armor (DDoS & WAF)

### Create Cloud Armor Policy
```bash
POLICY_NAME="pivotal-policy"

gcloud compute security-policies create $POLICY_NAME \
  --project=$PROJECT_ID

# Allow traffic from your country/regions
gcloud compute security-policies rules create 1000 \
  --security-policy=$POLICY_NAME \
  --action=allow \
  --origin-region-list="US,GB,CA" \
  --project=$PROJECT_ID

# Block traffic from other regions
gcloud compute security-policies rules create 2000 \
  --security-policy=$POLICY_NAME \
  --action=deny-403 \
  --project=$PROJECT_ID
```

**Note**: Cloud Armor requires Cloud Load Balancer and is not directly compatible with Cloud Run. Consider using WAF at CDN level (Cloudflare, Akamai).

---

## 📋 Security Checklist

- [ ] Domain mapped to Cloud Run
- [ ] TLS certificate issued and verified
- [ ] VPC connector created (if using private databases)
- [ ] Service account created with minimal permissions
- [ ] Cloud SQL/Memorystore firewall rules configured
- [ ] Cloud Storage bucket CORS configured
- [ ] App Base URL and webhooks updated
- [ ] Secrets Manager IAM binding verified
- [ ] Cloud Run minimum instances set to 0 (cost optimization)
- [ ] Cloud Run max instances set appropriately
- [ ] Monitoring alerts configured

---

## 🧪 Verification Commands

```bash
# Check domain mapping
gcloud run domain-mappings list --project=$PROJECT_ID

# Check service account permissions
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --format='table(bindings.role)' \
  --filter="bindings.members:serviceAccount:pivotal-app@$PROJECT_ID.iam.gserviceaccount.com"

# Check VPC connector status
gcloud compute networks vpc-access connectors describe pivotal-connector \
  --region=$REGION \
  --project=$PROJECT_ID

# Test service health
DOMAIN="crm.yourdomain.com"
curl -v https://$DOMAIN/api/health
```

