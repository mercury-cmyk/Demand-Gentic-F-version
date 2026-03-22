#!/usr/bin/env pwsh
# Audio test runner with tunnel guidance
# Usage: ./run-audio-test-with-tunnel.ps1

param(
    [string]$NgrokUrl,
    [switch]$SkipTunnelCheck
)

$ErrorActionPreference = "Stop"

Write-Host "🎤 OpenAI Realtime Audio Test" -ForegroundColor Cyan
Write-Host "=" * 70

# Check if server is running
Write-Host "`n📡 Checking server..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Method GET -Uri "http://localhost:5000/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
    Write-Host "✅ Server is running on http://localhost:5000" -ForegroundColor Green
} catch {
    Write-Host "❌ Server is NOT running!" -ForegroundColor Red
    Write-Host "   Start it first with: npm run dev" -ForegroundColor Yellow
    exit 1
}

# Check ngrok if tunnel URL not provided
if (-not $NgrokUrl -and -not $SkipTunnelCheck) {
    Write-Host "`n🌐 Checking for ngrok tunnel..." -ForegroundColor Yellow
    try {
        $ngrokDash = Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2 -ErrorAction SilentlyContinue
        $tunnel = $ngrokDash.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1
        
        if ($tunnel) {
            $NgrokUrl = $tunnel.public_url -replace "https://", "wss://"
            Write-Host "✅ Found ngrok tunnel: $($tunnel.public_url)" -ForegroundColor Green
            Write-Host "   Stream URL: $NgrokUrl/openai-realtime-dialer" -ForegroundColor Cyan
        } else {
            Write-Host "⚠️  No ngrok tunnel detected (ngrok not running)" -ForegroundColor Yellow
            Write-Host "   For audio to work, Telnyx needs a public WebSocket URL" -ForegroundColor Yellow
            Write-Host "   Run ngrok in another terminal: ngrok http 5000" -ForegroundColor Yellow
            Write-Host "   Then update your Telnyx Call Control App stream_url" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "ℹ️  ngrok tunnel status unavailable (ngrok dashboard not accessible)" -ForegroundColor Cyan
    }
}

# Get auth token
Write-Host "`n🔐 Authenticating..." -ForegroundColor Yellow
try {
    $body = '{"username":"admin","password":"admin123"}'
    $resp = Invoke-RestMethod -Method POST -Uri "http://localhost:5000/api/auth/login" -ContentType "application/json" -Body $body -TimeoutSec 5
    $env:AUTH_TOKEN = $resp.token
    Write-Host "✅ Authentication successful" -ForegroundColor Green
} catch {
    Write-Host "❌ Authentication failed!" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    exit 1
}

# Run the test
Write-Host "`n📞 Running audio transmission test..." -ForegroundColor Cyan
Write-Host "-" * 70

npx tsx test-audio-transmission.ts

Write-Host "`n" -ForegroundColor Cyan
Write-Host "=" * 70
Write-Host "📊 Test Complete" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Yellow
Write-Host "  1. Check the server console for audio transmission logs"
Write-Host "  2. Look for '🎙️ First inbound audio frame received from Telnyx'"
Write-Host "  3. Listen to the call - you should hear the AI agent voice"
Write-Host ""
if ($NgrokUrl) {
    Write-Host "🌐 Your public stream URL:" -ForegroundColor Cyan
    Write-Host "   $NgrokUrl/openai-realtime-dialer" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚙️  Make sure Telnyx Call Control App uses this URL in stream_url" -ForegroundColor Yellow
}
Write-Host ""