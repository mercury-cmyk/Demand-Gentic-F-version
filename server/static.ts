import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // In production, server runs from dist/server/index.js
  // Static files are in dist/public (sibling to dist/server)
  const distPath = path.resolve(import.meta.dirname, "..", "public");

  if (!fs.existsSync(distPath)) {
    console.error(`[Static] Build directory not found: ${distPath}`);
    console.error(`[Static] Current dirname: ${import.meta.dirname}`);
    // Don't throw - let the server continue running for API endpoints
    app.use("*", (_req, res) => {
      res.status(404).send("Frontend build not found. API endpoints are still available at /api/*");
    });
    return;
  }

  const indexPath = path.resolve(distPath, "index.html");
  console.log(`[Static] Serving static files from: ${distPath}`);
  console.log(`[Static] Index.html exists: ${fs.existsSync(indexPath)}`);
  
  // Serve static assets (js, css, images, etc.)
  app.use(express.static(distPath));

  // SPA fallback - serve index.html for all non-API routes
  // This enables client-side routing for React Router
  app.get("*", (req, res, next) => {
    // Skip API routes - they should 404 if not matched
    if (req.path.startsWith('/api/')) {
      return next();
    }
    
    // Skip if requesting a file with extension (likely static asset)
    if (req.path.includes('.') && !req.path.endsWith('.html')) {
      return next();
    }
    
    console.log(`[Static] SPA fallback for: ${req.path}`);
    res.sendFile(indexPath);
  });
}
