param(
  [string]$ProjectId = $env:GCP_PROJECT_ID,
  [string]$Region = $(if ([string]::IsNullOrWhiteSpace($env:GCP_REGION)) { "us-central1" } else { $env:GCP_REGION }),
  [string]$RuntimeServiceAccount = $env:CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT,
  [string]$KeyFile = $env:GOOGLE_APPLICATION_CREDENTIALS,
  [string]$CloudSdkConfigPath = $(Join-Path $PWD ".gcloud-automation")
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  $ProjectId = (gcloud config get-value project 2>$null).Trim()
}
if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  throw "No project set. Provide -ProjectId or set GCP_PROJECT_ID."
}

Write-Host "Project: $ProjectId"
Write-Host "Region: $Region"

# Force non-interactive auth and isolate from user profile reauth loops
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = "1"
if (-not [string]::IsNullOrWhiteSpace($CloudSdkConfigPath)) {
  if (-not (Test-Path $CloudSdkConfigPath)) {
    New-Item -ItemType Directory -Path $CloudSdkConfigPath | Out-Null
  }
  $env:CLOUDSDK_CONFIG = $CloudSdkConfigPath
}

if ([string]::IsNullOrWhiteSpace($KeyFile)) {
  throw "Key file is required in non-interactive mode. Set GOOGLE_APPLICATION_CREDENTIALS or pass -KeyFile."
}

if (Test-Path $KeyFile) {
  Write-Host "Activating service account key file: $KeyFile"
  gcloud auth activate-service-account --key-file "$KeyFile" --quiet | Out-Null
} else {
  throw "Key file path does not exist: $KeyFile"
}

gcloud config set project $ProjectId --quiet | Out-Null

$apis = @(
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "secretmanager.googleapis.com",
  "iam.googleapis.com",
  "serviceusage.googleapis.com",
  "logging.googleapis.com",
  "monitoring.googleapis.com",
  "pubsub.googleapis.com",
  "redis.googleapis.com"
)

Write-Host "Enabling APIs..."
gcloud services enable $apis --project $ProjectId

if (-not [string]::IsNullOrWhiteSpace($RuntimeServiceAccount)) {
  Write-Host "Applying IAM roles to runtime service account: $RuntimeServiceAccount"

  $roles = @(
    "roles/run.invoker",
    "roles/secretmanager.secretAccessor",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/pubsub.publisher",
    "roles/pubsub.subscriber",
    "roles/cloudsql.client",
    "roles/storage.objectAdmin"
  )

  foreach ($role in $roles) {
    gcloud projects add-iam-policy-binding $ProjectId --member "serviceAccount:$RuntimeServiceAccount" --role $role --quiet | Out-Null
    Write-Host "Granted $role"
  }
}

Write-Host "Dependency bootstrap complete."