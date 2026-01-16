#!/usr/bin/env bash
set -euo pipefail

# Enhanced Cloud Run Deploy Script with Secret Manager Integration
# This script builds, pushes to Artifact Registry, and deploys to Cloud Run
# with proper secret injection and environment variable mapping.

PROJECT_ID=${PROJECT_ID:-pivotalcrm-2026}
REGION=${REGION:-us-central1}
SERVICE=${SERVICE:-demandgentic-api}
REPOSITORY=${REPOSITORY:-pivotal-artifacts}
IMAGE_TAG=${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}
VPC_CONNECTOR=${VPC_CONNECTOR:-}
VPC_EGRESS=${VPC_EGRESS:-private-ranges-only}

echo "🚀 Cloud Run Deployment Script"
echo "=============================="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE"
echo "Repository: $REPOSITORY"
echo "Image Tag: $IMAGE_TAG"
echo "VPC Connector: ${VPC_CONNECTOR:-<not set>}"
echo "VPC Egress: $VPC_EGRESS"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

set_project() {
  gcloud config set project "$PROJECT_ID"
  echo -e "${GREEN}✓${NC} Set GCP project to $PROJECT_ID"
}

enable_apis() {
  echo ""
  echo "📡 Enabling required APIs..."
  gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    --project="$PROJECT_ID"
  echo -e "${GREEN}✓${NC} APIs enabled"
}

create_artifact_registry() {
  echo ""
  echo "📦 Setting up Artifact Registry..."
  
  if ! gcloud artifacts repositories describe "$REPOSITORY" \
    --location="$REGION" \
    --project="$PROJECT_ID" &>/dev/null; then
    
    gcloud artifacts repositories create "$REPOSITORY" \
      --repository-format=docker \
      --location="$REGION" \
      --description="Docker images for Pivotal CRM" \
      --project="$PROJECT_ID"
    echo -e "${GREEN}✓${NC} Created Artifact Registry repository: $REPOSITORY"
  else
    echo -e "${YELLOW}ℹ${NC} Artifact Registry repository already exists"
  fi
}

grant_cloud_build_permissions() {
  echo ""
  echo "🔐 Granting Cloud Build permissions..."
  
  PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  
  # Grant Artifact Registry writer role
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/artifactregistry.writer" \
    --quiet 2>/dev/null || true
  
  # Grant Cloud Run admin role
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/run.admin" \
    --quiet 2>/dev/null || true
  
  # Grant Service Account User role
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" \
    --quiet 2>/dev/null || true
  
  echo -e "${GREEN}✓${NC} Cloud Build permissions granted"
}

grant_cloud_run_secret_access() {
  echo ""
  echo "🔑 Granting Cloud Run service account secret access..."
  
  # Grant Secret Manager Accessor role to Cloud Run service account
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet 2>/dev/null || true
  
  echo -e "${GREEN}✓${NC} Secret Manager access granted to Cloud Run"
}

build_and_push_image() {
  echo ""
  echo "🏗️  Building and pushing Docker image..."
  
  IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:${IMAGE_TAG}"
  
  gcloud builds submit \
    --config=cloudbuild.yaml \
    --substitutions=_REGION="${REGION}",_SERVICE="${SERVICE}",_REPOSITORY="${REPOSITORY}" \
    --project="$PROJECT_ID"
  
  echo -e "${GREEN}✓${NC} Image built and pushed: $IMAGE_NAME"
}

deploy_to_cloud_run() {
  echo ""
  echo "🚀 Deploying to Cloud Run..."
  
  IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:${IMAGE_TAG}"
  VPC_ARGS=()
  if [[ -n "$VPC_CONNECTOR" ]]; then
    VPC_ARGS+=(--vpc-connector="$VPC_CONNECTOR" --vpc-egress="$VPC_EGRESS")
  fi
  
  gcloud run deploy "$SERVICE" \
    --image="${IMAGE_NAME}" \
    --region="${REGION}" \
    --platform=managed \
    --allow-unauthenticated \
    --project="$PROJECT_ID" \
    --env-vars-file=env.yaml \
    --max-instances=100 \
    --memory=512Mi \
    --cpu=1 \
    "${VPC_ARGS[@]}"
  
  echo -e "${GREEN}✓${NC} Deployed to Cloud Run"
}

print_summary() {
  echo ""
  echo "✅ Deployment Complete!"
  echo "======================="
  echo ""
  
  SERVICE_URL=$(gcloud run services describe "$SERVICE" \
    --region="${REGION}" \
    --format='value(status.url)' \
    --project="$PROJECT_ID" 2>/dev/null || echo "https://<region>-<project>.cloudfunctions.net")
  
  echo "Service URL: $SERVICE_URL"
  echo ""
  echo "Next steps:"
  echo "  1. Test the deployment: curl $SERVICE_URL/api/health"
  echo "  2. View logs: gcloud run logs read $SERVICE --region=$REGION --limit=50"
  echo "  3. Update custom domain: gcloud run domain-mappings create --service=$SERVICE --domain=your-domain.com"
  echo "  4. Set up monitoring: gcloud monitoring dashboards create --config-from-file=monitoring-dashboard.yaml"
  echo ""
}

# Main execution
set_project
enable_apis
create_artifact_registry
grant_cloud_build_permissions
grant_cloud_run_secret_access
build_and_push_image
deploy_to_cloud_run
print_summary
