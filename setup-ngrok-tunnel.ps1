# Setup ngrok tunnel for Telnyx audio streaming
# This exposes your local port 5000 publicly so Telnyx can deliver audio

Write-Host "🌐 Audio Tunnel Setup for Telnyx" -ForegroundColor Cyan
Write-Host "=" * 60
Write-Host ""

# Check if ngrok is installed
$ngrokPath = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrokPath) {
    Write-Host "❌ ngrok not found. Install it first:" -ForegroundColor Red
    Write-Host "   1. Download from: https://ngrok.com/download"
    Write-Host "   2. Extract and add to PATH, or run from extracted folder"
    Write-Host "   3. Run: ngrok config add-authtoken <your-authtoken>"
    Write-Host "   4. Then run this script again"
    exit 1
}

Write-Host "✅ ngrok is installed" -ForegroundColor Green
Write-Host ""

# Start ngrok tunnel
Write-Host "🚀 Starting ngrok tunnel on port 5000..." -ForegroundColor Cyan
Write-Host "Keep this window open while testing audio." -ForegroundColor Yellow
Write-Host ""

# Run ngrok with verbose output
ngrok http 5000 --log=stdout --log-level=info

Write-Host ""
Write-Host "⚠️  Tunnel stopped" -ForegroundColor Yellow
