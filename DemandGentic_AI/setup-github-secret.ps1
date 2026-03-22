# Script to help set up GitHub secret for GCP authentication
# Run this script and follow the instructions

$serviceAccountPath = "c:\Users\Zahid\Downloads\DemandGentic_AI\gcp-service-account.json"

if (Test-Path $serviceAccountPath) {
    Write-Host "📋 Found GCP service account file" -ForegroundColor Green

    # Read and encode the file
    $json = Get-Content $serviceAccountPath -Raw
    $base64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))

    Write-Host "`n✅ Base64-encoded credentials ready!`n" -ForegroundColor Green
    Write-Host "📝 Instructions to add GitHub secret:" -ForegroundColor Yellow
    Write-Host "1. Go to your GitHub repository" -ForegroundColor White
    Write-Host "2. Navigate to Settings → Secrets and variables → Actions" -ForegroundColor White
    Write-Host "3. Click 'New repository secret'" -ForegroundColor White
    Write-Host "4. Name: GCP_SA_KEY" -ForegroundColor White
    Write-Host "5. Value: (paste the base64 string below)" -ForegroundColor White
    Write-Host "6. Click 'Add secret'" -ForegroundColor White

    Write-Host "`n🔐 Encoded Secret (copy this):" -ForegroundColor Cyan
    Write-Host "================================" -ForegroundColor Cyan
    Write-Host $base64 -ForegroundColor Cyan
    Write-Host "================================`n" -ForegroundColor Cyan

    # Copy to clipboard if on Windows
    $base64 | Set-Clipboard
    Write-Host "✨ Secret already copied to clipboard!" -ForegroundColor Green

} else {
    Write-Host "❌ Service account file not found at: $serviceAccountPath" -ForegroundColor Red
}