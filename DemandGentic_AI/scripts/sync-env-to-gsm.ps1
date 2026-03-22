# sync-env-to-gsm.ps1
# Syncs all .env variables to Google Secret Manager
# Usage: .\scripts\sync-env-to-gsm.ps1 [-ProjectId your-project-id] [-EnvFile .env]

param(
    [string]$ProjectId = "pivotalb2b-2026",
    [string]$EnvFile = ".env",
    [switch]$DryRun = $false
)

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Sync .env to Google Secret Manager" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check if gcloud is installed
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: gcloud CLI not found. Install from https://cloud.google.com/sdk/docs/install" -ForegroundColor Red
    exit 1
}

# Check authentication
$account = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
if (-not $account) {
    Write-Host "ERROR: Not authenticated. Run 'gcloud auth login' first." -ForegroundColor Red
    exit 1
}
Write-Host "Authenticated as: $account" -ForegroundColor Green

# Set project
gcloud config set project $ProjectId 2>$null
Write-Host "Project: $ProjectId" -ForegroundColor Green
Write-Host ""

# Read .env file
if (-not (Test-Path $EnvFile)) {
    Write-Host "ERROR: $EnvFile not found" -ForegroundColor Red
    exit 1
}

$envContent = Get-Content $EnvFile -Raw
$lines = $envContent -split "`n"

$secrets = @()
$currentKey = $null
$currentValue = $null

foreach ($line in $lines) {
    # Skip empty lines and comments
    if ($line -match '^\s*$' -or $line -match '^\s*#') {
        continue
    }
    
    # Match KEY=VALUE or KEY="VALUE"
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        $key = $matches[1]
        $value = $matches[2].Trim()
        
        # Remove surrounding quotes if present
        if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") {
            $value = $matches[1]
        }
        
        # Skip empty values and placeholder values
        if ($value -and $value -ne "sk-REPLACE_ME" -and $value -ne "") {
            $secrets += @{
                Name = $key
                Value = $value
            }
        }
    }
}

Write-Host "Found $($secrets.Count) secrets to sync" -ForegroundColor Yellow
Write-Host ""

if ($DryRun) {
    Write-Host "=== DRY RUN MODE ===" -ForegroundColor Magenta
    foreach ($secret in $secrets) {
        $displayValue = if ($secret.Value.Length -gt 20) { 
            $secret.Value.Substring(0, 20) + "..." 
        } else { 
            $secret.Value 
        }
        Write-Host "  Would create: $($secret.Name) = $displayValue" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "Run without -DryRun to actually create secrets" -ForegroundColor Yellow
    exit 0
}

# Get existing secrets
Write-Host "Fetching existing secrets..." -ForegroundColor Gray
$existingSecrets = gcloud secrets list --format="value(name)" 2>$null
$existingSet = @{}
if ($existingSecrets) {
    foreach ($s in $existingSecrets) {
        $existingSet[$s] = $true
    }
}

$created = 0
$updated = 0
$failed = 0

foreach ($secret in $secrets) {
    $secretName = $secret.Name
    $secretValue = $secret.Value
    
    try {
        if ($existingSet[$secretName]) {
            # Update existing secret (add new version)
            Write-Host "Updating: $secretName" -ForegroundColor Yellow
            $secretValue | gcloud secrets versions add $secretName --data-file=- 2>$null
            if ($LASTEXITCODE -eq 0) {
                $updated++
                Write-Host "  ✓ Updated" -ForegroundColor Green
            } else {
                throw "Failed to update"
            }
        } else {
            # Create new secret
            Write-Host "Creating: $secretName" -ForegroundColor Cyan
            $secretValue | gcloud secrets create $secretName --data-file=- --replication-policy="automatic" 2>$null
            if ($LASTEXITCODE -eq 0) {
                $created++
                Write-Host "  ✓ Created" -ForegroundColor Green
            } else {
                throw "Failed to create"
            }
        }
    } catch {
        $failed++
        Write-Host "  ✗ Failed: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Summary" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Created: $created" -ForegroundColor Green
Write-Host "  Updated: $updated" -ForegroundColor Yellow
Write-Host "  Failed:  $failed" -ForegroundColor Red
Write-Host ""

# Generate Cloud Run service account binding command
Write-Host "To grant Cloud Run access to these secrets, run:" -ForegroundColor Magenta
Write-Host ""
Write-Host "  gcloud projects add-iam-policy-binding $ProjectId \" -ForegroundColor Gray
Write-Host "    --member='serviceAccount:$ProjectId@appspot.gserviceaccount.com' \" -ForegroundColor Gray
Write-Host "    --role='roles/secretmanager.secretAccessor'" -ForegroundColor Gray
Write-Host ""