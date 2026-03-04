#!/usr/bin/env pwsh

# Bulk regenerate transcripts using Telnyx phone lookup via API
# This script batches missing calls and sends them to the regenerate endpoint

param(
    [string]$BaseUrl = "https://demandgentic.ai",
    [string]$Token,
    [int]$BatchSize = 50
)

Write-Host "`n🚀 Starting bulk transcription regeneration" -ForegroundColor Green
Write-Host "   Base URL: $BaseUrl"
Write-Host "   Batch size: $BatchSize"
Write-Host "   Strategy: telnyx_phone_lookup`n"

# Get missing transcription IDs from database
Write-Host "📥 Fetching missing transcription IDs..." -ForegroundColor Cyan

$env:NODE_ENV = "production"

# Use ts-node to query database
$result = & npx ts-node --transpile-only -e @"
import "./server/env.ts";
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from "ws";
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  
  const csResult = await db.execute(sql\`SELECT id FROM call_sessions WHERE started_at >= NOW() - INTERVAL '10 days' AND COALESCE(duration_sec, 0) > 30 AND (ai_transcript IS NULL OR length(ai_transcript) < 20) ORDER BY started_at DESC\`);
  const daResult = await db.execute(sql\`SELECT id FROM dialer_call_attempts WHERE call_started_at >= NOW() - INTERVAL '10 days' AND COALESCE(call_duration_seconds, 0) > 30 AND (full_transcript IS NULL OR length(full_transcript) < 20) AND (ai_transcript IS NULL OR length(ai_transcript) < 20) ORDER BY call_started_at DESC\`);
  
  const ids = [...(csResult.rows || []), ...(daResult.rows || [])].map((r: any) => r.id);
  console.log(JSON.stringify(ids));
  await pool.end();
}

main();
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to fetch missing transcriptions" -ForegroundColor Red
    exit 1
}

$callIds = $result | ConvertFrom-Json
$totalCalls = $callIds.Length

if ($totalCalls -eq 0) {
    Write-Host "✅ No missing transcriptions found" -ForegroundColor Green
    exit 0
}

Write-Host "✅ Found $totalCalls missing transcriptions`n" -ForegroundColor Green

# Batch and process
$totalBatches = [Math]::Ceiling($totalCalls / $BatchSize)
$succeeded = 0
$failed = 0

Write-Host "📦 Processing in $totalBatches batches...`n" -ForegroundColor Cyan

for ($i = 0; $i -lt $totalCalls; $i += $BatchSize) {
    $batchNum = ($i / $BatchSize) + 1
    $batch = $callIds[$i..([Math]::Min($i + $BatchSize - 1, $totalCalls - 1))]
    $batchCount = $batch.Length
    
    Write-Host "[$batchNum/$totalBatches] Processing $batchCount calls..." -ForegroundColor Yellow
    
    try {
        $body = @{
            callIds = @($batch)
            strategy = "telnyx_phone_lookup"
        } | ConvertTo-Json -Depth 10
        
        $headers = @{
            "Content-Type" = "application/json"
        }
        
        if ($Token) {
            $headers["Authorization"] = "Bearer $Token"
        }
        
        $response = Invoke-WebRequest `
            -Uri "$BaseUrl/api/call-intelligence/transcription-gaps/regenerate" `
            -Method POST `
            -Headers $headers `
            -Body $body `
            -TimeoutSec 60
        
        $result = $response.Content | ConvertFrom-Json
        
        if ($result.success -and $result.data) {
            $succeeded += $result.data.succeeded
            $failed += $result.data.failed
            Write-Host "   ✅ Succeeded: $($result.data.succeeded), Failed: $($result.data.failed)" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Error: $($result.error)" -ForegroundColor Red
            $failed += $batchCount
        }
    } catch {
        Write-Host "   ❌ Request failed: $_" -ForegroundColor Red
        $failed += $batchCount
    }
    
    # Small delay between batches
    if ($batchNum -lt $totalBatches) {
        Start-Sleep -Milliseconds 1000
    }
}

Write-Host "`n$('=' * 60)" -ForegroundColor Cyan
Write-Host "📊 REGENERATION COMPLETE" -ForegroundColor Green
Write-Host "$('=' * 60)" -ForegroundColor Cyan
Write-Host "Total Processed: $totalCalls"
Write-Host "Succeeded:       $succeeded"
Write-Host "Failed:          $failed"
Write-Host "Success Rate:    $(([Math]::Round(($succeeded / $totalCalls) * 100, 2)))%"
Write-Host "`n✨ Regeneration job submitted!`n" -ForegroundColor Green
