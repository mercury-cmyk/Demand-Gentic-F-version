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

  console.log(`[Static] Serving static files from: ${distPath}`);
  app.use(express.static(distPath));

  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
