/**
 * Generate Cloud Run service.yaml with Secret Manager references
 * Usage: npx tsx scripts/generate-cloudrun-secrets.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ENV_FILE = '.env';
const OUTPUT_FILE = 'cloud-run-service-with-secrets.yaml';

// Read .env file
const envContent = fs.readFileSync(ENV_FILE, 'utf-8');
const lines = envContent.split('\n');

const secrets: { name: string; value: string }[] = [];

for (const line of lines) {
  // Skip empty lines and comments
  if (!line.trim() || line.trim().startsWith('#')) continue;
  
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) {
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    
    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    // Skip empty and placeholder values
    if (value && value !== 'sk-REPLACE_ME') {
      secrets.push({ name: key, value });
    }
  }
}

console.log(`Found ${secrets.length} environment variables`);

// Generate Cloud Run service.yaml with secret references
const serviceYaml = `apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: demandgentic-api
  labels:
    cloud.googleapis.com/location: us-central1
  annotations:
    run.googleapis.com/ingress: all
    run.googleapis.com/ingress-status: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/cpu-throttling: "false"
        run.googleapis.com/startup-cpu-boost: "true"
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      serviceAccountName: demandgentic-ai@appspot.gserviceaccount.com
      containers:
        - image: gcr.io/demandgentic-ai/demandgentic-api:latest
          ports:
            - name: http1
              containerPort: 5000
          resources:
            limits:
              cpu: "2"
              memory: 2Gi
          env:
            # Static configs (non-sensitive)
            - name: PORT
              value: "5000"
            - name: NODE_ENV
              value: "production"
            
            # Secrets from Secret Manager
${secrets.map(s => `            - name: ${s.name}
              valueFrom:
                secretKeyRef:
                  name: ${s.name}
                  key: latest`).join('\n')}
  traffic:
    - percent: 100
      latestRevision: true
`;

fs.writeFileSync(OUTPUT_FILE, serviceYaml);
console.log(`\nGenerated ${OUTPUT_FILE}`);
console.log('\nTo deploy with secrets:');
console.log(`  gcloud run services replace ${OUTPUT_FILE} --region=us-central1`);
