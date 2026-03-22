# DemandGentic.ai By Pivotal B2B Project

This project contains various scripts for managing AI campaigns and leads.

## Deployment policy

- **VM deployment is the canonical production path.**
- Use `vm-deploy/setup.sh` for fresh-host bootstrap.
- Use `vm-deploy/deploy.sh` for routine production deploys and updates.
- Treat Cloud Run / Cloud Build / Cloud Code deployment files as **legacy-only** unless explicitly needed for historical support.
- See `DEPLOYMENT.md` for the authoritative VM deployment runbook.

## How to run scripts

To run the TypeScript scripts in this project, you need to have Node.js and npm installed. The required dependencies are listed in `package.json`.

First, install the dependencies:
```bash
npm install
```

Then, you can run a specific script using `npx tsx`:
```bash
npx tsx .ts
```

For example, to find and create missed qualified leads, run:
```bash
npx tsx find-missed-qualified-leads.ts
```

To check for potentially qualified calls, run:
```bash
npx tsx check-qualified-calls.ts
```