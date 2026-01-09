$ErrorActionPreference = "Stop"

$PROJECT_ID = "pivotalb2b-2026"
$GITHUB_REPO = "zahid-mohammadi/DemanGent.ai-2026"
$SERVICE_ACCOUNT_NAME = "github-actions-deployer"
$POOL_NAME = "github-actions-pool-2"
$PROVIDER_NAME = "github-provider"

Write-Host "🚀 Setting up secure deployment for ${GITHUB_REPO}..."

# 1. Create Service Account
$saEmail = "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
$saExists = gcloud iam service-accounts describe $saEmail --project=$PROJECT_ID 2>$null
if (-not $saExists) {
    Write-Host "Creating service account..."
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME `
      --description="Service account for GitHub Actions deployment" `
      --display-name="GitHub Actions Deployer" `
      --project=$PROJECT_ID
} else {
    Write-Host "Service account exists."
}

# 2. Grant Permissions
Write-Host "Granting permissions..."
$roles = @(
    "roles/run.admin",
    "roles/iam.serviceAccountUser",
    "roles/artifactregistry.writer",
    "roles/storage.admin"
)

foreach ($role in $roles) {
    gcloud projects add-iam-policy-binding $PROJECT_ID `
      --member="serviceAccount:${saEmail}" `
      --role=$role `
      --condition=None `
      --quiet | Out-Null
}

# 3. Create Workload Identity Pool
$poolExists = gcloud iam workload-identity-pools describe $POOL_NAME --project=$PROJECT_ID --location="global" 2>$null
if (-not $poolExists) {
    Write-Host "Creating identity pool..."
    gcloud iam workload-identity-pools create $POOL_NAME `
      --project=$PROJECT_ID `
      --location="global" `
      --display-name="GitHub Actions Pool"
} else {
    Write-Host "Identity pool exists."
}

$POOL_ID = gcloud iam workload-identity-pools describe $POOL_NAME --project=$PROJECT_ID --location="global" --format='value(name)'

# 4. Create Provider
$providerExists = gcloud iam workload-identity-pools providers describe $PROVIDER_NAME --workload-identity-pool=$POOL_NAME --project=$PROJECT_ID --location="global" 2>$null
if (-not $providerExists) {
    Write-Host "Creating OIDC provider..."
    gcloud iam workload-identity-pools providers create $PROVIDER_NAME `
      --workload-identity-pool=$POOL_NAME `
      --project=$PROJECT_ID `
      --location="global" `
      --display-name="GitHub Provider" `
      --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" `
      --attribute-condition="assertion.repository == '${GITHUB_REPO}'" `
      --issuer-uri="https://token.actions.githubusercontent.com"
} else {
    Write-Host "Provider exists."
}

# 5. Bind Policy
Write-Host "Binding policy..."
gcloud iam service-accounts add-iam-policy-binding $saEmail `
  --project=$PROJECT_ID `
  --role="roles/iam.workloadIdentityUser" `
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${GITHUB_REPO}" `
  --condition=None `
  --quiet | Out-Null

# 6. Output Secrets
$PROVIDER_RESOURCE_NAME = gcloud iam workload-identity-pools providers describe $PROVIDER_NAME --workload-identity-pool=$POOL_NAME --project=$PROJECT_ID --location="global" --format='value(name)'

Write-Host ""
Write-Host "✅ SETUP COMPLETE!"
Write-Host "---------------------------------------------------"
Write-Host "Go to GitHub Repo > Settings > Secrets and variables > Actions"
Write-Host "Create these two repository secrets:"
Write-Host ""
Write-Host "Name: GCP_SERVICE_ACCOUNT"
Write-Host "Value: ${saEmail}"
Write-Host ""
Write-Host "Name: GCP_WORKLOAD_IDENTITY_PROVIDER"
Write-Host "Value: ${PROVIDER_RESOURCE_NAME}"
Write-Host "---------------------------------------------------"
