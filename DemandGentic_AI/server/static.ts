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

  // Hashed assets (js/css with content hash in filename) — immutable, cache forever
  app.use(
    '/assets',
    express.static(path.resolve(distPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }),
  );

  // All other static files (images, fonts, favicon, etc.) — moderate caching
  app.use(
    express.static(distPath, {
      maxAge: '1h',
      // Don't serve index.html via express.static — we handle it in the SPA fallback
      index: false,
    }),
  );

  // SPA fallback — serve index.html for all non-API, non-asset routes.
  // CRITICAL: no-cache so browsers always get the latest HTML with correct
  // asset references. This prevents stale HTML from referencing old JS bundles
  // or leaking dev-mode Vite client scripts from cached pages.
  app.get("*", (req, res, next) => {
    // Skip API routes — they should 404 if not matched
    if (req.path.startsWith('/api/')) {
      return next();
    }

    // Skip if requesting a file with an extension (likely a static asset miss)
    if (req.path.includes('.') && !req.path.endsWith('.html')) {
      return next();
    }

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.sendFile(indexPath);
  });
}