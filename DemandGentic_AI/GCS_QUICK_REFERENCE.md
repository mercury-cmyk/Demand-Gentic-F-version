# Quick Reference: Google Cloud Storage & Speech-to-Text

## Environment Configuration

### Development (`.env.local`)
```dotenv
# Already configured and working:
GOOGLE_CLOUD_PROJECT="pivotalb2b-2026"
GCP_PROJECT_ID="pivotalb2b-2026"
GCS_BUCKET="demandgentic-prod-storage-2026"

# Redis (GCP Memorystore)
REDIS_URL="redis://10.181.0.35:6379"
```

### Production (Cloud Run)
- Same environment variables above
- Service account: Cloud Run default (auto-authenticated)
- No service account key file needed

---

## Common Tasks

### Upload File to GCS
```bash
gsutil cp myfile.txt gs://demandgentic-prod-storage-2026/uploads/
```

### List GCS Bucket Contents
```bash
gsutil ls gs://demandgentic-prod-storage-2026/
```

### Transcribe a Recording
```bash
# Single call (dry-run):
npx tsx batch-transcribe-jan15.ts --limit 1 --verbose

# Execute transcription:
npx tsx batch-transcribe-jan15.ts --execute --limit 10
```

### Build & Test
```bash
npm install
npm run build
npm run dev
```

### Deploy to Cloud Run
```bash
gcloud run deploy demandgentic-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

---

## Troubleshooting

### GCS Access Denied
```bash
# Check service account IAM roles:
gcloud projects get-iam-policy pivotalb2b-2026

# Grant storage access:
gcloud projects add-iam-policy-binding pivotalb2b-2026 \
  --member=serviceAccount:cloud-run-sa@pivotalb2b-2026.iam.gserviceaccount.com \
  --role=roles/storage.admin
```

### Transcription Fails
1. Check bucket exists: `gsutil ls gs://demandgentic-prod-storage-2026`
2. Check recording URL is accessible: `curl -I `
3. Verify GCP project has Speech API enabled: `gcloud services list | grep speech`

### Connection Issues
```bash
# Test database:
psql $DATABASE_URL -c "SELECT 1"

# Test Redis:
redis-cli -u $REDIS_URL PING

# Test GCS:
gcloud storage ls gs://demandgentic-prod-storage-2026/
```

---

## Cost Monitoring

### Check GCS Costs
1. Go to: https://console.cloud.google.com/billing/
2. Select project: `pivotalb2b-2026`
3. View costs for:
   - Cloud Storage
   - Speech-to-Text API

### Estimate Monthly Cost
- **GCS Storage**: First 1GB free, then $0.020/GB/month
- **Transcription**: ~$0.0083 per minute = ~$0.50/hour
- **Egress**: First 1GB free, then $0.12/GB
- **Total**: ~$50/month for typical usage

---

## Removed / Deprecated

❌ **No longer use:**
- AWS S3 SDK
- AWS credentials (access key, secret key)
- AssemblyAI API key
- `S3_REGION` environment variable
- Any `S3_*` variables

✅ **Use instead:**
- Google Cloud Storage
- `GCS_BUCKET` environment variable
- `GOOGLE_CLOUD_PROJECT` environment variable
- Application Default Credentials (ADC)

---

## File Locations

### Key Services
- Storage API: `server/lib/s3.ts`
- Transcription API: `server/services/assemblyai-transcription.ts`
- Recording Management: `server/services/recording-storage.ts`
- CSV Import: `server/routes/contacts-csv-import.ts`

### Scripts
- Batch transcription: `batch-transcribe-jan15.ts`
- Secret migration: `scripts/migrate-secrets-to-gcp.sh`
- Dev server: `scripts/dev-with-ngrok.ts`

### Config Files
- Environment example: `.env.example`
- Environment local: `.env.local`
- Docker: `docker-compose.yml`
- Packages: `package.json`

---

## Support

For questions or issues:
1. Check `GCS_MIGRATION_COMPLETE.md` for detailed documentation
2. Check `MIGRATION_SUMMARY.md` for overview
3. See Google Cloud docs:
   - https://cloud.google.com/storage/docs
   - https://cloud.google.com/speech-to-text/docs
   - https://cloud.google.com/run/docs

---

**Last Updated**: January 16, 2026
**Status**: ✅ Production Ready