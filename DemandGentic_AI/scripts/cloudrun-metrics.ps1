$ErrorActionPreference = 'Stop'

$project = 'pivotalb2b-2026'
$serviceName = 'demandgentic-api'
$end = (Get-Date).ToUniversalTime()
$start = $end.AddHours(-6)

$token = gcloud auth print-access-token
$headers = @{ Authorization = "Bearer $token" }

function Get-TimeSeries {
  param(
    [string]$MetricType,
    [string]$Aligner
  )

  $filter = "metric.type=`"$MetricType`" AND resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$serviceName`""
  $queryParams = @{
    'filter' = $filter
    'interval.startTime' = $start.ToString('o')
    'interval.endTime' = $end.ToString('o')
    'aggregation.alignmentPeriod' = '300s'
    'aggregation.perSeriesAligner' = $Aligner
    'pageSize' = '500'
  }

  $queryString = ($queryParams.GetEnumerator() | ForEach-Object {
    "{0}={1}" -f [System.Net.WebUtility]::UrlEncode([string]$_.Key), [System.Net.WebUtility]::UrlEncode([string]$_.Value)
  }) -join '&'

  $uri = "https://monitoring.googleapis.com/v3/projects/$project/timeSeries?$queryString"
  try {
    return Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
  } catch {
    Write-Host "Failed metric $MetricType : $($_.Exception.Message)"
    return $null
  }
}

function Expand-Values {
  param(
    $TimeSeriesResponse,
    [ValidateSet('double','int64','dist_mean')]
    [string]$Kind
  )

  $rows = @()
  if (-not $TimeSeriesResponse -or -not $TimeSeriesResponse.timeSeries) {
    return $rows
  }

  foreach ($ts in $TimeSeriesResponse.timeSeries) {
    $revision = $ts.resource.labels.revision_name
    foreach ($point in $ts.points) {
      $value = $null
      switch ($Kind) {
        'double' { $value = [double]$point.value.doubleValue }
        'int64' { $value = [double]$point.value.int64Value }
        'dist_mean' { $value = [double]$point.value.distributionValue.mean }
      }
      if ($null -ne $value) {
        $rows += [PSCustomObject]@{ revision = $revision; value = $value }
      }
    }
  }

  return $rows
}

function Get-Stats {
  param($Rows)
  if (-not $Rows -or $Rows.Count -eq 0) { return $null }

  $vals = @($Rows | ForEach-Object { [double]$_.value } | Sort-Object)
  $count = $vals.Count
  $avg = ($vals | Measure-Object -Average).Average
  $max = ($vals | Measure-Object -Maximum).Maximum
  $idx95 = [Math]::Floor(($count - 1) * 0.95)
  if ($idx95 -lt 0) { $idx95 = 0 }

  return [PSCustomObject]@{
    samples = $count
    avg = [Math]::Round($avg, 4)
    p95 = [Math]::Round($vals[$idx95], 4)
    max = [Math]::Round($max, 4)
  }
}

$cpu = Get-TimeSeries -MetricType 'run.googleapis.com/container/cpu/utilizations' -Aligner 'ALIGN_PERCENTILE_95'
$mem = Get-TimeSeries -MetricType 'run.googleapis.com/container/memory/utilizations' -Aligner 'ALIGN_PERCENTILE_95'
$req = Get-TimeSeries -MetricType 'run.googleapis.com/request_count' -Aligner 'ALIGN_RATE'
$lat = Get-TimeSeries -MetricType 'run.googleapis.com/request_latencies' -Aligner 'ALIGN_PERCENTILE_95'

$cpuRows = Expand-Values -TimeSeriesResponse $cpu -Kind 'double'
$memRows = Expand-Values -TimeSeriesResponse $mem -Kind 'double'
$reqRows = Expand-Values -TimeSeriesResponse $req -Kind 'double'
$latRows = Expand-Values -TimeSeriesResponse $lat -Kind 'double'

$latStats = Get-Stats -Rows $latRows
if ($latStats) {
  $latStats = [PSCustomObject]@{
    samples = $latStats.samples
    avgMs = [Math]::Round(($latStats.avg / 1000), 2)
    p95Ms = [Math]::Round(($latStats.p95 / 1000), 2)
    maxMs = [Math]::Round(($latStats.max / 1000), 2)
  }
}

$result = [PSCustomObject]@{
  windowStart = $start.ToString('o')
  windowEnd = $end.ToString('o')
  cpuUtilization = Get-Stats -Rows $cpuRows
  memoryUtilization = Get-Stats -Rows $memRows
  requestRatePerSecond = Get-Stats -Rows $reqRows
  latencyP95 = $latStats
}

$result | ConvertTo-Json -Depth 8