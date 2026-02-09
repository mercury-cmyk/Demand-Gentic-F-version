# clean-sync-secrets.ps1
# Ensures 1:1 parity between local .env and Google Secret Manager + Cloud Run

# $ErrorActionPreference = "Stop" # Disabled to prevent gcloud stderr from halting script
$ProjectId = "pivotalb2b-2026"
$ServiceName = "demandgentic-api"
$Region = "us-central1"

Write-Host "STARTING SECRET SYNC for Project: $ProjectId" -ForegroundColor Cyan

# --- STEP 1: READ .ENV ---
$envPath = "$PWD\.env"
Write-Host "Reading .env from: $envPath"

if (-not (Test-Path $envPath)) {
    Write-Error ".env file not found at $envPath"
    exit 1
}

# Force read as string array
$envContent = @(Get-Content -Path $envPath)
Write-Host "Read $($envContent.Count) lines from .env"

# Fallback mechanism if Get-Content fails to read lines (sometimes happens with encoding)
if ($envContent.Count -eq 0) {
    Write-Warning "Get-Content returned 0 lines. Attempting .NET read..."
    try {
        $envContent = [System.IO.File]::ReadAllLines($envPath)
        Write-Host "Read $($envContent.Count) lines using .NET"
    } catch {
        Write-Error "Failed to read .env: $_"
        exit 1
    }
}

$localSecrets = @{}
$excludeKeys = @("PORT", "NODE_ENV", "TZ", "ENABLE_LOG_STREAMING", "DISABLE_REDIS")

foreach ($line in $envContent) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.Trim().StartsWith("#")) { continue }
    
    # Simple Split based parsing to be robust
    # Only match if it contains '=' and starts with a char
    if ($line -match '^[^=]+=[^=]*') {
        $parts = $line -split '=', 2
        $key = $parts[0].Trim()
        $val = $parts[1].Trim()

        if ($excludeKeys -contains $key) { continue }
        if ([string]::IsNullOrWhiteSpace($key)) { continue }
        
        # Remove surrounding quotes
        if ($val.StartsWith('"') -and $val.EndsWith('"')) { 
            $val = $val.Substring(1, $val.Length - 2) 
        }
        elseif ($val.StartsWith("'") -and $val.EndsWith("'")) { 
            $val = $val.Substring(1, $val.Length - 2) 
        }
        
        $localSecrets[$key] = $val
    }
}

Write-Host "Found $($localSecrets.Count) valid secrets to sync" -ForegroundColor Green

if ($localSecrets.Count -eq 0) {
    Write-Error "No secrets found to sync. Aborting to prevent wiping production."
    exit 1
}

# --- STEP 2: UPSERT SECRETS TO GCP ---
Write-Host "Fetching existing secrets from Google Secret Manager..." -ForegroundColor Gray
$remoteSecretsRaw = gcloud secrets list --project=$ProjectId --format='value(name)'
$remoteSecrets = @()
if ($remoteSecretsRaw) { 
    $remoteSecrets = $remoteSecretsRaw -split "`r`n" | ForEach-Object { 
        if ($_) { $_.Trim().Split('/')[-1] }
    }
}

foreach ($key in $localSecrets.Keys) {
    $val = $localSecrets[$key]
    if (-not $val) { continue }
    
    if ($remoteSecrets -contains $key) {
        Write-Host "Updating: $key" -ForegroundColor Blue
        # Redirect stderr to stdout to avoid PowerShell strict error on warnings
        $val | gcloud secrets versions add $key --data-file=- --project=$ProjectId --quiet 2>&1 | Out-Null
    } else {
        Write-Host "Creating: $key" -ForegroundColor Green
        $val | gcloud secrets create $key --data-file=- --replication-policy=automatic --project=$ProjectId --quiet 2>&1 | Out-Null
    }
}

# --- STEP 3: UPDATE CLOUD RUN CONFIG ---
Write-Host "Fetching Cloud Run Configuration..." -ForegroundColor Gray
$serviceConfigJson = gcloud run services describe $ServiceName --project=$ProjectId --region=$Region --format="json" | Out-String
if (-not $serviceConfigJson) {
     Write-Error "Failed to fetch service config."
     exit 1
}

$serviceConfig = $serviceConfigJson | ConvertFrom-Json

# Access the container env
$containers = $serviceConfig.spec.template.spec.containers
if ($containers.Count -eq 0) { Write-Error "No containers found in service config"; exit 1 }

# Filter out old secrets, keep literal env vars
$currentEnv = $containers[0].env
$newEnv = @()
if ($currentEnv) {
    foreach ($envVar in $currentEnv) {
        # Keep it if it does NOT have valueFrom.secretKeyRef
        if (-not $envVar.psobject.Properties['valueFrom'] -or -not $envVar.valueFrom.psobject.Properties['secretKeyRef']) {
            $newEnv += $envVar
        }
    }
}

# Add ALL local secrets
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

# Update the object
$serviceConfig.spec.template.spec.containers[0].env = $newEnv

# Serialize back to JSON and Save
$newConfigPath = "$PWD\temp-service-update.json"
$serviceConfig | ConvertTo-Json -Depth 10 | Set-Content $newConfigPath

Write-Host "Replacing Cloud Run Configuration..." -ForegroundColor Cyan
gcloud run services replace $newConfigPath --project=$ProjectId --region=$Region

# --- STEP 4: DELETE STALE SECRETS ---
foreach ($remote in $remoteSecrets) {
    if (-not $localSecrets.ContainsKey($remote)) {
        if (-not [string]::IsNullOrWhiteSpace($remote)) {
            Write-Host "DELETING STALE SECRET: $remote" -ForegroundColor Red
            gcloud secrets delete $remote --project=$ProjectId --quiet | Out-Null
        }
    }
}

if (Test-Path $newConfigPath) { Remove-Item $newConfigPath }

Write-Host "SYNC COMPLETED SUCCESSFULLY!" -ForegroundColor Green
