# ============================================
# DemandGentic AI - Multi-Service Verification Script
# Verifies Cloud Run services, SERVICE_ROLE env values,
# domain mappings, and health endpoints.
# ============================================

param(
    [string]$ProjectId = "pivotalb2b-2026",
    [string]$Region = "us-central1"
)

$ErrorActionPreference = "Stop"

# Prevent non-fatal stderr from native tools (like gcloud) from becoming terminating errors in PS7+
if ($null -ne (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue)) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$gcloudExe = (Get-Command gcloud.cmd -ErrorAction SilentlyContinue).Source
if (-not $gcloudExe) {
    $gcloudExe = (Get-Command gcloud -ErrorAction Stop).Source
}

$checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
    param(
        [string]$Name,
        [bool]$Passed,
        [string]$Details
    )

    $checks.Add([PSCustomObject]@{
        Name = $Name
        Passed = $Passed
        Details = $Details
    })

    if ($Passed) {
        Write-Host "[PASS] $Name - $Details" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $Name - $Details" -ForegroundColor Red
    }
}

function Invoke-GcloudCommand {
    param(
        [string[]]$CommandArgs,
        [string]$Fallback = ""
    )

    try {
        $escapedArgs = $CommandArgs | ForEach-Object {
            if ($_ -match '[\s"]') {
                '"' + ($_ -replace '"', '\"') + '"'
            } else {
                $_
            }
        }

        $cmdLine = '"' + $gcloudExe + '" ' + ($escapedArgs -join ' ')
        $output = cmd.exe /d /c "$cmdLine 2>nul"

        if ($LASTEXITCODE -ne 0) {
            throw "gcloud exited with code $LASTEXITCODE"
        }

        return $output
    } catch {
        if ($PSBoundParameters.ContainsKey('Fallback')) {
            return $Fallback
        }
        throw
    }
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "DemandGentic Multi-Service Verification" -ForegroundColor Cyan
Write-Host "Project: $ProjectId | Region: $Region" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Ensure gcloud context is set
$currentProject = Invoke-GcloudCommand -CommandArgs @('config', 'get-value', 'project', '--quiet') -Fallback ''
if (-not $currentProject -or $currentProject -eq "(unset)") {
    Add-Check -Name "gcloud project configured" -Passed $false -Details "No active gcloud project configured"
    $currentProject = ""
} else {
    $currentProject = $currentProject.Trim()
    Add-Check -Name "gcloud project configured" -Passed ($currentProject -eq $ProjectId) -Details "Active project: $currentProject"
}

$services = @(
    @{ Name = "demandgentic-voice"; ExpectedRole = "voice"; ExpectedDomain = "demandgentic.ai" },
    @{ Name = "demandgentic-analysis"; ExpectedRole = "analysis"; ExpectedDomain = "app.pivotal-b2b.com" },
    @{ Name = "demandgentic-email"; ExpectedRole = "email"; ExpectedDomain = "pivotal-b2b.com" }
)

Write-Host "`n--- Service + Role checks ---" -ForegroundColor Yellow

foreach ($svc in $services) {
    $name = $svc.Name
    $expectedRole = $svc.ExpectedRole

    $serviceJson = Invoke-GcloudCommand -CommandArgs @('run', 'services', 'describe', $name, '--region', $Region, '--project', $ProjectId, '--format=json', '--quiet') -Fallback ''

    if (-not $serviceJson) {
        Add-Check -Name "$name exists" -Passed $false -Details "Service not found or inaccessible"
        Add-Check -Name "$name role" -Passed $false -Details "Cannot validate SERVICE_ROLE"
        continue
    }

    $service = $null
    try {
        $service = $serviceJson | ConvertFrom-Json
    } catch {
        Add-Check -Name "$name exists" -Passed $false -Details "Unable to parse service describe output"
        Add-Check -Name "$name role" -Passed $false -Details "Cannot validate SERVICE_ROLE"
        continue
    }

    $url = $service.status.url

    if (-not $url) {
        Add-Check -Name "$name exists" -Passed $false -Details "Service not found or inaccessible"
        Add-Check -Name "$name role" -Passed $false -Details "Cannot validate SERVICE_ROLE"
        continue
    }

    Add-Check -Name "$name exists" -Passed $true -Details "URL: $url"

    $roleValue = ""
    $envEntries = $service.spec.template.spec.containers[0].env
    if ($envEntries) {
        $matchedEnv = $envEntries | Where-Object { $_.name -eq 'SERVICE_ROLE' } | Select-Object -First 1
        if ($matchedEnv) {
            $roleValue = $matchedEnv.value
        }
    }

    if (-not $roleValue) {
        Add-Check -Name "$name role" -Passed $false -Details "SERVICE_ROLE not set"
    } else {
        $roleValue = $roleValue.Trim()
        Add-Check -Name "$name role" -Passed ($roleValue -eq $expectedRole) -Details "Expected=$expectedRole, Actual=$roleValue"
    }

    # Health via service URL (try common endpoints)
    $healthOk = $false
    $healthDetails = ""
    $healthPaths = @('/api/health', '/health', '/')
    foreach ($path in $healthPaths) {
        try {
            $healthResp = Invoke-WebRequest -Uri ("{0}{1}" -f $url.TrimEnd('/'), $path) -Method GET -TimeoutSec 20 -UseBasicParsing
            if ($healthResp.StatusCode -ge 200 -and $healthResp.StatusCode -lt 300) {
                $healthOk = $true
                $healthDetails = "HTTP $($healthResp.StatusCode) via $path"
                break
            }
        } catch {
            $healthDetails = "Health check failed via service URL: $($_.Exception.Message)"
        }
    }
    Add-Check -Name "$name health" -Passed $healthOk -Details $healthDetails
}

Write-Host "`n--- Domain mapping checks ---" -ForegroundColor Yellow

$domainMappingsRaw = Invoke-GcloudCommand -CommandArgs @('run', 'domain-mappings', 'list', '--region', $Region, '--project', $ProjectId, '--format=value(metadata.name,spec.routeName,status.conditions[?type=''Ready''].status)', '--quiet') -Fallback ''

$domainRows = @()
if ($domainMappingsRaw) {
    $domainRows = $domainMappingsRaw -split "`n" | Where-Object { $_ -and $_.Trim() }
}

$expectedDomainRoutes = @(
    @{ Domain = "demandgentic.ai"; Route = "demandgentic-voice" },
    @{ Domain = "pivotal-b2b.com"; Route = "demandgentic-email" },
    @{ Domain = "app.pivotal-b2b.com"; Route = "demandgentic-analysis" }
)

foreach ($mapping in $expectedDomainRoutes) {
    $domain = $mapping.Domain
    $route = $mapping.Route

    $matched = $domainRows | Where-Object {
        ($_ -split "\s+")[0] -eq $domain
    }

    if (-not $matched) {
        Add-Check -Name "Domain $domain" -Passed $false -Details "No Cloud Run domain mapping found"
        continue
    }

    $bestLine = $matched | Select-Object -First 1
    $parts = $bestLine -split "\s+"
    $actualRoute = if ($parts.Length -ge 2) { $parts[1] } else { "" }
    $readyState = if ($parts.Length -ge 3) { $parts[2] } else { "Unknown" }

    $routeOk = ($actualRoute -eq $route)
    $readyOk = ($readyState -eq "True")

    Add-Check -Name "Domain $domain route" -Passed $routeOk -Details "Expected=$route, Actual=$actualRoute"
    Add-Check -Name "Domain $domain ready" -Passed $readyOk -Details "Ready=$readyState"
}

Write-Host "`n--- Domain health checks ---" -ForegroundColor Yellow

$domains = @("https://demandgentic.ai", "https://pivotal-b2b.com", "https://app.pivotal-b2b.com")
foreach ($domainUrl in $domains) {
    $ok = $false
    $details = ""
    try {
        $resp = Invoke-WebRequest -Uri "$domainUrl/api/health" -Method GET -TimeoutSec 20 -UseBasicParsing
        $ok = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
        $details = "HTTP $($resp.StatusCode)"
    } catch {
        $details = $_.Exception.Message
    }
    Add-Check -Name "Health $domainUrl" -Passed $ok -Details $details
}

Write-Host "`n============================================" -ForegroundColor Cyan
$passedCount = @($checks | Where-Object { $_.Passed }).Count
$failedCount = @($checks | Where-Object { -not $_.Passed }).Count
Write-Host "Verification Summary: $passedCount passed, $failedCount failed" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

if ($failedCount -gt 0) {
    Write-Host "`nFailed checks:" -ForegroundColor Red
    $checks | Where-Object { -not $_.Passed } | ForEach-Object {
        Write-Host " - $($_.Name): $($_.Details)" -ForegroundColor Red
    }
    exit 1
}

Write-Host "All checks passed ✅" -ForegroundColor Green
exit 0
