# GCP Secret Manager Migration Script (PowerShell)
# Migrates all secrets from .env file to GCP Secret Manager

param(
    [string]$ProjectId = "pivotalcrm-2026",
    [string]$EnvFile = ".env"
)

Write-Host "🔐 Migrating Secrets to GCP Secret Manager" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project: $ProjectId" -ForegroundColor Yellow
Write-Host ""

# Function to create or update secret
function Set-GCPSecret {
    param(
        [string]$SecretName,
        [string]$SecretValue
    )
    
    if ([string]::IsNullOrWhiteSpace($SecretValue)) {
        Write-Host "⚠️  Skipping $SecretName (empty value)" -ForegroundColor Yellow
        return
    }
    
    # Check if secret exists
    $secretExists = gcloud secrets describe $SecretName --project=$ProjectId 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        # Update existing secret
        Write-Host "Updating $SecretName..." -ForegroundColor Blue
        echo $SecretValue | gcloud secrets versions add $SecretName --data-file=- --project=$ProjectId 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Updated: $SecretName" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed to update: $SecretName" -ForegroundColor Red
        }
    } else {
        # Create new secret
        Write-Host "Creating $SecretName..." -ForegroundColor Blue
        echo $SecretValue | gcloud secrets create $SecretName --data-file=- --replication-policy=automatic --project=$ProjectId 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Created: $SecretName" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed to create: $SecretName" -ForegroundColor Red
        }
    }
}

# Read .env file and create secrets
if (Test-Path $EnvFile) {
    Write-Host "Reading secrets from $EnvFile..." -ForegroundColor Cyan
    Write-Host ""
    
    $envContent = Get-Content $EnvFile
    $secretCount = 0
    
    foreach ($line in $envContent) {
        # Skip comments and empty lines
        if ($line -match '^\s*#' -or $line -match '^\s*$') {
            continue
        }
        
        # Parse KEY=VALUE
        if ($line -match '^([A-Z_][A-Z0-9_]*)=(.*)$') {
            $key = $matches[1]
            $value = $matches[2]
            
            # Remove quotes if present
            $value = $value -replace '^"(.*)"$', '$1'
            $value = $value -replace "^'(.*)'$", '$1'
            
            Set-GCPSecret -SecretName $key -SecretValue $value
            $secretCount++
        }
    }
    
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "✓ Migration Complete!" -ForegroundColor Green
    Write-Host "  Total secrets processed: $secretCount" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Verify with:" -ForegroundColor Cyan
    Write-Host "  gcloud secrets list --project=$ProjectId" -ForegroundColor White
} else {
    Write-Host "✗ Error: $EnvFile not found!" -ForegroundColor Red
    exit 1
}