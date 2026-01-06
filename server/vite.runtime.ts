import type { Express } from "express";
import type { Server } from "http";

// Production stub: Vite dev server is not available in production.
export async function setupVite(_app: Express, _server: Server) {
  // No-op in production build
  return;
}
