#!/usr/bin/env pwsh


$projectId = "gen-lang-client-0789558283"

Write-Host "=== Fixing Google OAuth Configuration ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Current (broken) credentials:" -ForegroundColor Red
Write-Host "  Client ID: 823201449858-hg97q2ja40qifdj4260c602579drth59.apps.googleusercontent.com"
Write-Host "  Issue: This OAuth app likely doesn't have correct redirect URIs registered"
Write-Host ""

Write-Host "Options:" -ForegroundColor Yellow
Write-Host ""
Write-Host "OPTION A: Use the documented OAuth app" -ForegroundColor Green
Write-Host "==========================================="
Write-Host ""
Write-Host "1. Update GCP Secrets to the configured client:"
Write-Host ""
Write-Host '   $clientId = "157077239459-jmgrio47i2d6llo13c7lp89eqe1dlen2.apps.googleusercontent.com"'
Write-Host '   $clientSecret = "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"'
Write-Host ""
Write-Host "   # Update Client ID"
Write-Host "   echo `$clientId | gcloud secrets versions add GOOGLE_AUTH_CLIENT_ID --data-file=- --project=$projectId"
Write-Host ""
Write-Host "   # Update Client Secret"
Write-Host "   echo `$clientSecret | gcloud secrets versions add GOOGLE_CLIENT_SECRET --data-file=- --project=$projectId"
Write-Host ""
Write-Host "2. Verify the OAuth app in Google Cloud Console:"
Write-Host "   - Go to: https://console.cloud.google.com/apis/credentials"
Write-Host "   - Select: gen-lang-client-0789558283"
Write-Host "   - Find OAuth 2.0 Client ID: 157077239459-..."
Write-Host "   - Click it and add these Authorized redirect URIs:"
Write-Host "     * https://demandgentic.ai/api/oauth/google/callback"
Write-Host "     * http://localhost:8080/api/oauth/google/callback"
Write-Host ""
Write-Host "3. Redeploy the service:"
Write-Host "   .\deploy-final-v2.ps1"
Write-Host ""
Write-Host "4. Test:"
Write-Host "   - Clear browser cache"
Write-Host "   - Try connecting Google account again"
Write-Host ""
Write-Host ""
Write-Host "OPTION B: Investigate the current OAuth app" -ForegroundColor Cyan
Write-Host "=============================================="
Write-Host ""
Write-Host "1. Go to https://console.cloud.google.com/apis/credentials"
Write-Host "2. Select: gen-lang-client-0789558283"
Write-Host "3. Click on OAuth 2.0 Client ID: 823201449858-..."
Write-Host "4. Check 'Authorized redirect URIs' - should include:"
Write-Host "   - https://demandgentic.ai/api/oauth/google/callback"
Write-Host "   - http://localhost:8080/api/oauth/google/callback"
Write-Host ""
Write-Host "5. If missing, add them and save"
Write-Host "6. Then redeploy"
Write-Host ""
Write-Host ""
Write-Host "RECOMMENDED: Use Option A (revert to documented credentials)" -ForegroundColor Green