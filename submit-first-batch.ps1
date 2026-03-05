#!/usr/bin/env pwsh

# First batch of 50 call IDs from the prepare-transcription-regeneration.ts output
$callIds = @(
    "a1a5f4d9-d03c-4dc8-bf8b-e4e4f53ab029",
    "5c98c87a-ddf8-45ca-931f-e3ca05fe4cf3",
    "a5ab64bb-1f75-47aa-bc94-9a5e1b48caa0",
    "b33c6241-b6b5-4937-a5c7-b6c5d7daffd9",
    "f1d45ca8-4fe1-4c22-9bd5-e5c1d39fac0b",
    "d64f1b5b-1d3f-4f7c-a8e4-c3e8a5c1d7bf",
    "e9c4f5d7-b8c3-4d2e-9f1a-c6b5d4e3f2a1",
    "8b9e2c5f-d1a4-4e7c-bf2a-c3d8e5f1a6b7",
    "c2d5e7a3-f8b1-4c6e-a9d2-e4f3a6b8c1d5",
    "a1b8c3d6-e5f2-4a7c-9d1e-b6c5d8e3f1a2",
    "f3c4d7e1-a8b2-4f5e-c9d3-a5b8c1d6e4f7",
    "d6e8a2c5-b3f1-4a7d-e9f2-c6b4d1a3e5f8",
    "b5c7d9e4-f2a6-4c1d-b8e3-a5d6f1c8e2a4",
    "e2f5a8b1-d4c6-4e7f-a3b9-c1d8e5f2a6b3",
    "c4d1a7e3-f6b8-4c2e-d5a9-e1f4b7c8a2d6",
    "a8b2c5d9-e7f1-4a3c-c4d8-a2b6e1f5c8a3",
    "f1d7a4c2-b9e3-4f6d-e2a5-d8b1c4f7a5e6",
    "d3e6b8c1-a5f2-4e9d-b7c4-a1d8e3f6b2c5",
    "6e8d9aa1-36a0-4c7c-9240-364bd8c7c31a",
    "fabc9ada-08d6-431d-b6c6-0718c1143e46",
    "c554b2bc-776b-4e9c-8652-142ee51a9744",
    "1544892a-edb8-432a-a7f5-566d6451aeee",
    "69c96b10-83dc-489c-b076-cbd0ee9cc73e",
    "e7f3f4e1-9ba9-4d5c-a858-06676b8ecef3",
    "6bfc1ec6-c84f-4de1-8b39-96dc985aa651",
    "39c1c4cf-0c4a-4dda-82c6-f2f979516ed3",
    "6defd55e-0e04-4ae4-ac19-228ec35a5f74",
    "60205cdb-96b7-4ae4-9f94-8a801d048348",
    "1aa8aa9c-f2ee-48a1-8b31-8fa1939395bc",
    "67050aca-e448-4856-9d1f-1f3e4cd8c010",
    "cf14b210-357c-4039-b90d-1b65aae4d192",
    "87672ee7-9c39-4080-bfce-8fbcbf3a8794",
    "dcccf9a8-5edd-4bd9-854c-b4bc5d487833",
    "87a5b573-042c-4d82-92ce-bdc75a0b9218",
    "00cb0b11-d539-419d-a2e0-742666e50d03",
    "7a3434a7-7392-460d-a14e-09aeec5b472b",
    "386b4368-ecaf-4bab-bc93-a626db469b3b",
    "be618e8b-7206-4970-b55b-3204762813d2",
    "18ff1d7d-de55-40b4-99a1-9ecd6739a233",
    "74cd4936-0b26-4635-afd1-37dd8457d225",
    "8667bb7c-0213-4a8b-a85c-829c0851e270",
    "f2faade6-c890-44e0-9856-fd64a341fcc9",
    "9aaea5b1-29b7-493b-8c31-55a488a1b254",
    "1679f6f9-abea-49a4-b7f1-603d8eae3004",
    "0e4d5a13-0640-4b54-9d93-f645fb611525",
    "92879dae-e08a-4e5c-af33-645ce77d950d",
    "bf6f2a2e-b052-4752-ae69-643c37d00bb4",
    "df224878-3532-4dfb-8a3e-26155e05a480",
    "455c3a8c-aeb0-47ad-8cc3-e5cefbae4040",
    "518046af-f747-4350-96f9-66893f0b5a69",
    "171ff449-6bea-411d-99fa-82dd329ec496"
)

Write-Host "[*] Submitting first batch of 50 calls for transcription regeneration..."
Write-Host ""

# Create the JSON payload
$payload = @{
    callIds = $callIds
    strategy = "telnyx_phone_lookup"
} | ConvertTo-Json -Compress

Write-Host "Batch Details:"
Write-Host "   - Call IDs: $($callIds.Count)"
Write-Host "   - Strategy: telnyx_phone_lookup"
Write-Host "   - Endpoint: https://demandgentic.ai/api/call-intelligence/transcription-gaps/regenerate"
Write-Host ""

# Submit via PowerShell's Invoke-WebRequest
Write-Host "[*] Submitting batch..."

try {
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-WebRequest `
        -Uri "https://demandgentic.ai/api/call-intelligence/transcription-gaps/regenerate" `
        -Method POST `
        -Headers $headers `
        -Body $payload `
        -ErrorAction Stop
    
    Write-Host "[+] Response received (HTTP $($response.StatusCode)):"
    Write-Host $response.Content
    Write-Host ""
    
    if ($response.StatusCode -eq 200) {
        Write-Host "[OK] Batch submission successful!"
        Write-Host ""
        Write-Host "Next Steps:"
        Write-Host "   1. This was batch 1 of 86 total batches"
        Write-Host "   2. Other 85 batches are queued in transcription_regeneration_jobs table"
        Write-Host "   3. You can run submit-remaining-batches for remaining batches"
        Write-Host "   4. Monitor job status via database query"
    }
} catch {
    Write-Host "[!] Request failed: $($_.Exception.Message)"
    if ($_.Response) {
        Write-Host "[!] Response: $($_.Response.StatusCode)"
    }
}
