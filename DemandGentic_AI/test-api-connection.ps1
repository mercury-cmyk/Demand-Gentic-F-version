#!/usr/bin/env powershell

# Test basic connectivity
Write-Host "Testing API connectivity..."

try {
    $response = Invoke-WebRequest -Uri "https://demandgentic.ai/" -Method GET -ErrorAction Stop
    Write-Host "[OK] Base URL is accessible (HTTP $($response.StatusCode))"
} catch {
    Write-Host "[ERROR] Cannot reach base URL: $($_.Exception.Message)"
    exit 1
}

# Test with a simple payload
Write-Host ""
Write-Host "Testing POST with simple payload..."

$payload = @{
    callIds = @("test-id-1", "test-id-2")
    strategy = "telnyx_phone_lookup"
} | ConvertTo-Json -Compress

Write-Host "Payload: $payload"

try {
    $response = Invoke-WebRequest `
        -Uri "https://demandgentic.ai/api/call-intelligence/transcription-gaps/regenerate" `
        -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $payload `
        -ErrorAction Stop
    
    Write-Host "[OK] Request succeeded (HTTP $($response.StatusCode))"
    Write-Host "Response: $($response.Content)"
} catch [System.Net.HttpRequestException] {
    Write-Host "[ERROR] HTTP Error: $($_.Exception.Message)"
    Write-Host "Response: $($_.Exception.Response)"
} catch {
    Write-Host "[ERROR] Request failed: $($_.Exception.Message)"
    exit 1
}