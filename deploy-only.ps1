# deploy-only.ps1
# Resumes the deployment part of the sync

$ProjectId = "pivotalb2b-2026"
$ServiceName = "demandgentic-api"
$Region = "us-central1"

Write-Host "RESUMING DEPLOYMENT..." -ForegroundColor Cyan

# 1. Read .env again
$envPath = "$PWD\.env"
$envContent = @(Get-Content -Path $envPath)
$localSecrets = @{}
$excludeKeys = @("PORT", "NODE_ENV", "TZ", "ENABLE_LOG_STREAMING", "DISABLE_REDIS")

foreach ($line in $envContent) {
    if ($line -match '^[^=]+=[^=]*') {
        $parts = $line -split '=', 2
        $key = $parts[0].Trim()
        $val = $parts[1].Trim()
        if ($excludeKeys -contains $key) { continue }
        if ($line.Trim().StartsWith("#")) { continue }
        $localSecrets[$key] = $val
    }
}
Write-Host "Loaded $($localSecrets.Count) secrets from .env"

# 2. Fetch Config
Write-Host "Fetching Cloud Run Configuration..."
$serviceConfigJson = gcloud run services describe $ServiceName --project=$ProjectId --region=$Region --format="json" | Out-String
$serviceConfig = $serviceConfigJson | ConvertFrom-Json

# 3. Update Env
$containers = $serviceConfig.spec.template.spec.containers
$currentEnv = $containers[0].env
$newEnv = @()

# Keep existing NON-secret vars
if ($currentEnv) {
    foreach ($envVar in $currentEnv) {
         if (-not $envVar.psobject.Properties['valueFrom'] -or -not $envVar.valueFrom.psobject.Properties['secretKeyRef']) {
            $newEnv += $envVar
        }
    }
}

# Add Secrets
foreach ($key in $localSecrets.Keys) {
    $newEnv += @{
        name = $key
        valueFrom = @{
            secretKeyRef = @{
                name = $key
                key = "latest"
            }
        }
    }
}

$serviceConfig.spec.template.spec.containers[0].env = $newEnv

# 4. Deploy
$newConfigPath = "final-deploy.json"
$serviceConfig | ConvertTo-Json -Depth 10 | Set-Content $newConfigPath

Write-Host "Replacing Cloud Run Service..." -ForegroundColor Cyan
# Capture both streams to avoid crash, permit error visibility
gcloud run services replace $newConfigPath --project=$ProjectId --region=$Region 2>&1 | Write-Host

Write-Host "DONE"