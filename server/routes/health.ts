import { Router } from "express";

const router = Router();

/**
 * Health check endpoint for Cloud Run and load balancers
 * Returns 200 if the service is healthy
 */
router.get("/health", async (req, res) => {
  try {
    // Basic health check - service is running
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
    };

    res.status(200).json(health);
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Readiness check - verifies database connectivity
 */
router.get("/ready", async (req, res) => {
  try {
    // Import db to check connection
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");
    
    // Simple query to verify DB connection
    await db.execute(sql`SELECT 1`);

    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (error) {
    res.status(503).json({
      status: "not_ready",
      timestamp: new Date().toISOString(),
      database: "disconnected",
      error: error instanceof Error ? error.message : "Database connection failed",
    });
  }
});

export default router;
