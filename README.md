# DemandEarn-AI

Full-stack application with Cloud Run deployment support.

## How to Run Locally in VS Code

### Backend (Cloud Run style)
1. Open **Run and Debug** (Ctrl+Shift+D)
2. Select **"Cloud Run: Run Locally"** and press F5
3. Backend logs (console.log/console.error) appear in the **Output** panel → "Cloud Code - Cloud Run"
4. Access the service at `http://localhost:8080`
5. Test logging: `curl http://localhost:8080/api/health` — check VS Code Output for log line

### Alternative: Node Debug
Select **"Node: Debug Server"** to run with full Node.js debugging (breakpoints, step-through).

### Frontend Chrome Debugging (Optional)
1. Start the backend first (Cloud Run or Node Debug)
2. Select **"Chrome: Local Frontend (Console in VS Code)"**
3. Browser `console.log` calls appear in VS Code **Debug Console**

## Development

```bash
npm install       # Install dependencies
npm run dev       # Run dev server (port 8080)
npm run build     # Build for production
npm run start     # Start production build
```

## Deployment

```bash
gcloud run deploy demangent-api --source . --region us-central1 --allow-unauthenticated
```
