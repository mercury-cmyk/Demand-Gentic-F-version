#!/bin/bash
set -e

PROJECT_ID="demandgentic"
GITHUB_REPO="zahid-mohammadi/DemanGent.ai-2026" # Case sensitive!
SERVICE_ACCOUNT_NAME="github-actions-deployer"
POOL_NAME="github-actions-pool-2" # Using suffix to ensure unique
PROVIDER_NAME="github-provider"

echo "🚀 Setting up secure deployment for ${GITHUB_REPO}..."

# 1. Create Service Account
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" --project="${PROJECT_ID}" > /dev/null 2>&1; then
    echo "Creating service account..."
    gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
      --description="Service account for GitHub Actions deployment" \
      --display-name="GitHub Actions Deployer" \
      --project="${PROJECT_ID}"
else
    echo "Service account exists."
fi

# 2. Grant Permissions
echo "Granting permissions..."
# Cloud Run Admin (to deploy)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin" > /dev/null

# Service Account User (to act as the runtime service account)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" > /dev/null

# Artifact Registry Writer (to push images)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer" > /dev/null

# Storage Admin (for Cloud Build logs/staging if needed)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.admin" > /dev/null

# 3. Create Workload Identity Pool
if ! gcloud iam workload-identity-pools describe "${POOL_NAME}" --project="${PROJECT_ID}" --location="global" > /dev/null 2>&1; then
    echo "Creating identity pool..."
    gcloud iam workload-identity-pools create "${POOL_NAME}" \
      --project="${PROJECT_ID}" \
      --location="global" \
      --display-name="GitHub Actions Pool"
else
    echo "Identity pool exists."
fi

# Get Pool ID
POOL_ID=$(gcloud iam workload-identity-pools describe "${POOL_NAME}" --project="${PROJECT_ID}" --location="global" --format='value(name)')

# 4. Create Provider
if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_NAME}" --workload-identity-pool="${POOL_NAME}" --project="${PROJECT_ID}" --location="global" > /dev/null 2>&1; then
    echo "Creating OIDC provider..."
    gcloud iam workload-identity-pools providers create "${PROVIDER_NAME}" \
      --workload-identity-pool="${POOL_NAME}" \
      --project="${PROJECT_ID}" \
      --location="global" \
      --display-name="GitHub Provider" \
      --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
      --attribute-condition="assertion.repository == '${GITHUB_REPO}'" \
      --issuer-uri="https://token.actions.githubusercontent.com"
else
    echo "Provider exists."
fi

# 5. Bind Policy (Allow GitHub Repo to act as Service Account)
# Note: We bind the specific repository subject
echo "Binding policy..."
gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${GITHUB_REPO}" > /dev/null

# 6. Output Secrets
PROVIDER_RESOURCE_NAME=$(gcloud iam workload-identity-pools providers describe "${PROVIDER_NAME}" --workload-identity-pool="${POOL_NAME}" --project="${PROJECT_ID}" --location="global" --format='value(name)')

echo ""
echo "✅ SETUP COMPLETE!"
echo "---------------------------------------------------"
echo "Go to GitHub Repo > Settings > Secrets and variables > Actions"
echo "Create these two repository secrets:"
echo ""
echo "Name: GCP_SERVICE_ACCOUNT"
echo "Value: ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
echo ""
echo "Name: GCP_WORKLOAD_IDENTITY_PROVIDER"
echo "Value: ${PROVIDER_RESOURCE_NAME}"
echo "---------------------------------------------------"
