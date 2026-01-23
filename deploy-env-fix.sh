#!/bin/bash

# Deploy updated environment variables to Cloud Run
# This will trigger a new deployment with the correct configuration

echo "========================================="
echo "UPDATING CLOUD RUN ENVIRONMENT VARIABLES"
echo "========================================="
echo ""

SERVICE_NAME="demandgentic-api"
REGION="us-central1"
PUBLIC_TEXML_HOST="demandgentic-api-657571555590.us-central1.run.app"

echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo "Setting PUBLIC_TEXML_HOST: $PUBLIC_TEXML_HOST"
echo ""

echo "Updating service..."
gcloud run services update $SERVICE_NAME \
  --region=$REGION \
  --update-env-vars PUBLIC_TEXML_HOST=$PUBLIC_TEXML_HOST \
  --quiet

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Service updated successfully!"
  echo ""
  echo "The change will take effect immediately."
  echo "No need to refresh - the server is already running with new config."
  echo ""
  echo "You can now test AI agent calls from the UI:"
  echo "1. Go to https://demandgentic.ai/campaigns"
  echo "2. Select a campaign with AI agent"
  echo "3. Click 'Agent Console' or 'Test AI Agent'"
  echo "4. Initiate a test call"
else
  echo ""
  echo "❌ Failed to update service"
  echo "You may need to authenticate: gcloud auth login"
fi

echo ""
echo "========================================="
