#!/bin/bash

# Add OPENAI_WEBHOOK_SECRET to Google Cloud Secret Manager
echo "Adding OPENAI_WEBHOOK_SECRET to Google Cloud Secret Manager..."

echo -n "whsec_oJNXLtoOVllf8PB0HAS35nh/WyUVHeOB6h3sBFv41A0=" | \
  gcloud secrets create OPENAI_WEBHOOK_SECRET \
    --data-file=- \
    --replication-policy="automatic" \
    2>/dev/null || \
  echo -n "whsec_oJNXLtoOVllf8PB0HAS35nh/WyUVHeOB6h3sBFv41A0=" | \
  gcloud secrets versions add OPENAI_WEBHOOK_SECRET \
    --data-file=-

echo "Secret added/updated successfully!"
echo ""
echo "To verify, run: gcloud secrets versions access latest --secret=OPENAI_WEBHOOK_SECRET"