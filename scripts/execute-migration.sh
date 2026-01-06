#!/bin/bash

# GCP Migration Execution Script
# This script automates the entire migration process

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="pivotalcrm-2026"
REGION="us-central1"
SERVICE_NAME="pivotalcrm-service"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Pivotal CRM - Google Cloud Platform Migration           ║${NC}"
echo -e "${BLUE}║   Automated Execution Script                               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to print step headers
print_step() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
}

# Function to check if command succeeded
check_success() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1${NC}"
    else
        echo -e "${RED}✗ $1 - FAILED${NC}"
        exit 1
    fi
}

# STEP 1: Pre-flight Checks
print_step "STEP 1: Pre-flight Checks"

echo "Checking gcloud CLI installation..."
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}✗ gcloud CLI not found. Please install it first.${NC}"
    echo "Download from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi
check_success "gcloud CLI found"

echo "Checking if .env file exists..."
if [ ! -f ".env" ]; then
    echo -e "${RED}✗ .env file not found${NC}"
    echo "Please ensure .env file exists with all required credentials"
    exit 1
fi
check_success ".env file found"

echo "Counting secrets in .env file..."
SECRET_COUNT=$(grep -v '^#' .env | grep -v '^$' | wc -l)
echo -e "${BLUE}Found $SECRET_COUNT secrets to migrate${NC}"

# STEP 2: GCP Authentication
print_step "STEP 2: Authenticating with Google Cloud"

echo "Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID
check_success "Project set"

echo "Checking authentication status..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
    echo -e "${YELLOW}Not authenticated. Opening browser for login...${NC}"
    gcloud auth login
    check_success "User authentication"
    
    echo "Setting application default credentials..."
    gcloud auth application-default login
    check_success "Application default credentials"
else
    echo -e "${GREEN}✓ Already authenticated${NC}"
fi

echo "Verifying project access..."
gcloud projects describe $PROJECT_ID > /dev/null 2>&1
check_success "Project access verified"

# STEP 3: Enable Required APIs
print_step "STEP 3: Enabling Required GCP APIs"

REQUIRED_APIS=(
    "run.googleapis.com"
    "cloudbuild.googleapis.com"
    "artifactregistry.googleapis.com"
    "secretmanager.googleapis.com"
    "compute.googleapis.com"
    "logging.googleapis.com"
    "monitoring.googleapis.com"
)

for api in "${REQUIRED_APIS[@]}"; do
    echo "Enabling $api..."
    gcloud services enable $api --project=$PROJECT_ID --quiet
    check_success "$api enabled"
done

# STEP 4: Migrate Secrets
print_step "STEP 4: Migrating Secrets to Secret Manager"

if [ ! -f "scripts/migrate-secrets-to-gcp.sh" ]; then
    echo -e "${RED}✗ Secret migration script not found${NC}"
    exit 1
fi

chmod +x scripts/migrate-secrets-to-gcp.sh
echo "Running secret migration script..."
./scripts/migrate-secrets-to-gcp.sh
check_success "Secrets migrated"

echo "Verifying secrets in Secret Manager..."
SECRET_COUNT_GCP=$(gcloud secrets list --project=$PROJECT_ID --format="value(name)" | wc -l)
echo -e "${BLUE}$SECRET_COUNT_GCP secrets created in Secret Manager${NC}"

# STEP 5: Create Artifact Registry
print_step "STEP 5: Creating Artifact Registry"

REPO_NAME="pivotalcrm-repo"

echo "Checking if repository exists..."
if gcloud artifacts repositories describe $REPO_NAME --location=$REGION --project=$PROJECT_ID &> /dev/null; then
    echo -e "${YELLOW}Repository already exists, skipping creation${NC}"
else
    echo "Creating Artifact Registry repository..."
    gcloud artifacts repositories create $REPO_NAME \
        --repository-format=docker \
        --location=$REGION \
        --project=$PROJECT_ID \
        --description="Docker repository for Pivotal CRM"
    check_success "Artifact Registry created"
fi

# STEP 6: Grant Cloud Build Permissions
print_step "STEP 6: Configuring IAM Permissions"

echo "Getting project number..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

echo "Granting Cloud Build permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member=serviceAccount:$CLOUD_BUILD_SA \
    --role=roles/run.admin \
    --quiet > /dev/null 2>&1
check_success "Cloud Run Admin role granted"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member=serviceAccount:$CLOUD_BUILD_SA \
    --role=roles/iam.serviceAccountUser \
    --quiet > /dev/null 2>&1
check_success "Service Account User role granted"

# STEP 7: Build and Deploy
print_step "STEP 7: Building Docker Image and Deploying to Cloud Run"

if [ ! -f "scripts/deploy-to-cloud-run.sh" ]; then
    echo -e "${RED}✗ Deployment script not found${NC}"
    exit 1
fi

chmod +x scripts/deploy-to-cloud-run.sh
echo "Running deployment script..."
./scripts/deploy-to-cloud-run.sh
check_success "Deployment completed"

# STEP 8: Verify Deployment
print_step "STEP 8: Verifying Deployment"

echo "Getting service URL..."
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format='value(status.url)')

if [ -z "$SERVICE_URL" ]; then
    echo -e "${RED}✗ Failed to get service URL${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Service URL: $SERVICE_URL${NC}"

echo "Waiting for service to be ready (30 seconds)..."
sleep 30

echo "Testing health endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $SERVICE_URL/health || echo "000")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    echo -e "${GREEN}✓ Health check passed (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${YELLOW}⚠ Health check returned HTTP $HTTP_CODE${NC}"
    echo "Checking logs for errors..."
    gcloud run logs read $SERVICE_NAME --region=$REGION --limit=20
fi

# STEP 9: Final Summary
print_step "STEP 9: Migration Summary"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              🎉 MIGRATION COMPLETED! 🎉                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Service Details:${NC}"
echo -e "  • Service Name:    ${GREEN}$SERVICE_NAME${NC}"
echo -e "  • Project ID:      ${GREEN}$PROJECT_ID${NC}"
echo -e "  • Region:          ${GREEN}$REGION${NC}"
echo -e "  • Service URL:     ${GREEN}$SERVICE_URL${NC}"
echo -e "  • Secrets Migrated: ${GREEN}$SECRET_COUNT_GCP${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "  1. Test your application: ${GREEN}$SERVICE_URL${NC}"
echo "  2. View logs: ${YELLOW}gcloud run logs tail $SERVICE_NAME --region=$REGION${NC}"
echo "  3. Monitor metrics in Cloud Console"
echo "  4. Configure custom domain (optional)"
echo "  5. Set up alerts and monitoring"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "  • View logs:"
echo "    ${YELLOW}gcloud run logs read $SERVICE_NAME --region=$REGION --limit=100${NC}"
echo ""
echo "  • Update service:"
echo "    ${YELLOW}gcloud run services update $SERVICE_NAME --region=$REGION${NC}"
echo ""
echo "  • Rollback to previous revision:"
echo "    ${YELLOW}gcloud run services update-traffic $SERVICE_NAME --to-revisions=REVISION_NAME=100${NC}"
echo ""
echo -e "${GREEN}Migration completed successfully! 🚀${NC}"
echo ""
