# Audio Transmission Test Runner
# This script manages both the server and test processes
# PSScriptAnalyzer Suppress: PSUseDeclaredVarsMoreThanAssignments

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "AUDIO TRANSMISSION TEST" -ForegroundColor Cyan
Write-Host "======================================`n" -ForegroundColor Cyan

# Kill any existing process on port 5000
Write-Host "Cleaning up port 5000..." -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

# Start the server in a separate process
Write-Host "`nStarting server..." -ForegroundColor Yellow
$serverProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" -PassThru -NoNewWindow
Write-Host "✅ Server started (PID: $($serverProcess.Id))" -ForegroundColor Green

# Wait for server to be ready
Write-Host "Waiting for server to initialize..." -ForegroundColor Yellow
$maxRetries = 60
$retryCount = 0
$serverReady = $false

while ($retryCount -lt $maxRetries -and -not $serverReady) {
    try {
        Invoke-WebRequest -Uri "http://localhost:5000" -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
        $serverReady = $true
        Write-Host "✅ Server is ready" -ForegroundColor Green
    } catch {
        $retryCount++
        if ($retryCount % 10 -eq 0) {
            Write-Host "Still waiting... ($retryCount/$maxRetries)" -ForegroundColor Gray
        }
        Start-Sleep -Seconds 1
    }
}

if ($serverReady) {
    Write-Host "✅ Server is ready`n" -ForegroundColor Green
    
    # Get auth token
    Write-Host "Getting authentication token..." -ForegroundColor Yellow
    try {
        $token = (Invoke-RestMethod -Method POST -Uri "http://localhost:5000/api/auth/login" `
            -ContentType "application/json" `
            -Body '{"username":"admin","password":"admin123"}' `
            -TimeoutSec 5).token
        
        if ($token) {
            Write-Host "✅ Auth token obtained`n" -ForegroundColor Green
            $env:AUTH_TOKEN = $token
            
            # Run the test
            Write-Host "Starting audio transmission test...`n" -ForegroundColor Yellow
            Write-Host "======================================" -ForegroundColor Yellow
            npx tsx test-audio-transmission.ts
            Write-Host "======================================`n" -ForegroundColor Yellow
        } else {
            Write-Host "❌ Failed to get auth token" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ Error: $_" -ForegroundColor Red
    } finally {
        # Kill the server process
        Write-Host "`nCleaning up..." -ForegroundColor Yellow
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "✅ Server stopped" -ForegroundColor Green
    }
} else {
    Write-Host "❌ Server failed to start" -ForegroundColor Red
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
}