#!/usr/bin/env bash
set -euo pipefail

PROJECT=${PROJECT:-pivotalcrm-2026}
REGION=${REGION:-us-central1}
SERVICE=${SERVICE:-pivotalcrm-service}
REPOSITORY=${REPOSITORY:-pivotal-artifacts}

# Build and deploy using Cloud Build + cloudbuild.yaml
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_REGION=${REGION},_SERVICE=${SERVICE},_REPOSITORY=${REPOSITORY} \
  --project=${PROJECT}

echo "Deployed ${SERVICE} to project ${PROJECT} in ${REGION}" 
