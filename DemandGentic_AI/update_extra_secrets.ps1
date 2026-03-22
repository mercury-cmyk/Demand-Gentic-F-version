function Update-Secret ($name, $val) {
    Write-Host "Processing $name..."
    $exists = gcloud secrets describe $name --project=pivotalb2b-2026 2>&1 | Out-String
    if ($exists -match "NOT_FOUND") {
        Write-Host "Creating $name"
        $val | gcloud secrets create $name --data-file=- --replication-policy=automatic --project=pivotalb2b-2026
    } else {
        Write-Host "Updating $name"
        $val | gcloud secrets versions add $name --data-file=- --project=pivotalb2b-2026
    }
}

Update-Secret "TELNYX_SIP_USERNAME" "usermercury63270"
Update-Secret "TELNYX_SIP_PASSWORD" "zahid1234"
Update-Secret "TELNYX_SIP_CONNECTION_ID" "2845920641004078445"
Update-Secret "DEEPGRAM_API_KEY" "43b56ac08b7da33bc845cc6c04a73605156e7011"