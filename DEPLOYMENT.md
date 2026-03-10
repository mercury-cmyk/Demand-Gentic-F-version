# DemandGentic Deployment Runbook

## Policy

**VM deployment is the number 1 and only preferred production deployment path moving forward.**

- The canonical production workflow lives under `vm-deploy/`.
- Cloud Run / Cloud Build / Cloud Code assets remain in the repo only as **legacy references**.
- If a deployment choice is ambiguous, always choose the VM path.

## Canonical VM workflow

### Fresh VM setup

Run once on a fresh Linux VM:

```bash
sudo bash vm-deploy/setup.sh
```

What it does:

1. Updates system packages
2. Installs Docker and the Docker Compose plugin if needed
3. Installs Certbot
4. Clones or updates the repo into `/home/Zahid/demandgentic`
5. Generates `vm-deploy/.env` via `vm-deploy/fetch-secrets.sh`
6. Creates SSL certificates for `demandgentic.ai`
7. Opens required firewall ports and applies host tuning

### Routine production deploy

Run for normal deploys/updates:

```bash
bash vm-deploy/deploy.sh
```

Optional media bridge rebuild:

```bash
bash vm-deploy/deploy.sh --rebuild-media-bridge
```

What it does:

1. Pulls the latest code from `main`
2. Builds the API image
3. Optionally rebuilds the media bridge image
4. Restarts the Docker Compose stack
5. Verifies service health locally and via the public domain

## VM stack topology

The authoritative runtime stack is defined in `vm-deploy/docker-compose.yml`.

- `dg_nginx` — host-network reverse proxy and SSL termination on ports `80/443`
- `dg_api` — main app/API on port `8080`
- `dg_drachtio` — SIP signaling on `5060/udp`, admin on `9022`
- `dg_media_bridge` — RTP / Gemini Live bridge on `8090`
- `dg_certbot` — SSL renewal loop

## Secrets and environment

`vm-deploy/fetch-secrets.sh` is the canonical environment bootstrap for production.

- Writes `vm-deploy/.env`
- Pulls secrets from Google Secret Manager
- Authenticates through the VM metadata server
- Targets project `gen-lang-client-0789558283`

Important:

- Do **not** commit `vm-deploy/.env`
- Keep production secrets in Secret Manager, not in ad-hoc local files

## Host requirements

The VM path expects:

- A Linux VM with Docker support
- DNS for `demandgentic.ai` pointing to the VM
- Open firewall ports:
  - `80/tcp`
  - `443/tcp`
  - `5060/udp`
  - `8090/tcp`
  - `10000:10500/udp`

## Health checks

After deploy, verify:

- API: `http://localhost:8080/api/health`
- Media bridge: `http://localhost:8090/health`
- Public HTTPS: `https://demandgentic.ai/api/health`

## Operational notes

- The app runs with `NODE_ENV=production`
- SIP is expected to be enabled in production on the VM path
- The VM deployment path assumes local Drachtio + media bridge co-residency

## Notes

Cloud Run / Cloud Build deployment files were removed. The VM path is the only production deployment method.
