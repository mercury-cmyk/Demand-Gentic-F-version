# Multi-Service Deploy + Verification Runbook

This runbook validates the 4 Cloud Run services after deployment.

## 1) Deploy all services at once

Use either method:

- Local script: `./deploy-multi-service.ps1`
- Cloud Build pipeline: `gcloud builds submit --config cloudbuild.yaml .`

## 2) Confirm services are running

```powershell
gcloud run services describe demandgentic-web --region us-central1 --format="value(status.url)"
gcloud run services describe demandgentic-voice --region us-central1 --format="value(status.url)"
gcloud run services describe demandgentic-analysis --region us-central1 --format="value(status.url)"
gcloud run services describe demandgentic-email --region us-central1 --format="value(status.url)"
```

## 3) Verify role env vars are correct

```powershell
gcloud run services describe demandgentic-web --region us-central1 --format="yaml(spec.template.spec.containers[0].env)"
gcloud run services describe demandgentic-voice --region us-central1 --format="yaml(spec.template.spec.containers[0].env)"
gcloud run services describe demandgentic-analysis --region us-central1 --format="yaml(spec.template.spec.containers[0].env)"
gcloud run services describe demandgentic-email --region us-central1 --format="yaml(spec.template.spec.containers[0].env)"
```

Expected key values:
- `demandgentic-web` => `SERVICE_ROLE=web`
- `demandgentic-voice` => `SERVICE_ROLE=voice`
- `demandgentic-analysis` => `SERVICE_ROLE=analysis`
- `demandgentic-email` => `SERVICE_ROLE=email`

## 4) Verify custom domains

Target mapping:
- `demandgentic.ai` -> `demandgentic-voice`
- `pivotal-b2b.com` -> `demandgentic-email`
- `app.pivotal-b2b.com` -> `demandgentic-analysis`

Check mappings:

```powershell
gcloud run domain-mappings list --region us-central1
```

## 5) Health checks through custom domains

```powershell
curl https://demandgentic.ai/api/health
curl https://pivotal-b2b.com/api/health
curl https://app.pivotal-b2b.com/api/health
```

If your health route differs, replace `/api/health` with your active readiness route.

## 6) Webhook sanity checks (voice)

Ensure providers point to `demandgentic.ai`:
- Telnyx webhook host should use `https://demandgentic.ai/...`
- LiveKit webhook/callback host should use `https://demandgentic.ai/...`

Quick runtime logs check:

```powershell
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=demandgentic-voice" --limit 50 --format="value(textPayload)"
```

## 7) Rollback (single service)

If one role regresses, rollback only that service:

```powershell
gcloud run revisions list --service demandgentic-voice --region us-central1
gcloud run services update-traffic demandgentic-voice --region us-central1 --to-revisions REVISION_NAME=100
```

Repeat similarly for `demandgentic-analysis`, `demandgentic-email`, or `demandgentic-web`.

## 8) Success criteria

Deployment is considered good when:
- All 4 services have latest revision ready.
- Each service has the correct `SERVICE_ROLE`.
- Custom domains resolve and return healthy responses.
- Voice webhooks are hitting `demandgentic.ai` and producing expected call logs.
- No sustained 5xx spikes in Cloud Run metrics/logs.