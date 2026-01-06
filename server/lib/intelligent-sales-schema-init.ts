import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Initializes schema constraints for the Intelligent Sales Operating System
 * Called on server startup to ensure CHECK constraints exist in all environments
 */
export async function initializeIntelligentSalesSchema(): Promise<void> {
  try {
    console.log("🔧 Initializing Intelligent Sales Operating System schema constraints...");

    // Add CHECK constraints for score fields (0-100 range validation)
    // These are idempotent - if they already exist, PostgreSQL will skip them
    await db.execute(sql`
      DO $$ 
      BEGIN
        -- Engagement score constraint
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'check_engagement_score_range'
        ) THEN
          ALTER TABLE pipeline_opportunities 
            ADD CONSTRAINT check_engagement_score_range 
            CHECK (engagement_score IS NULL OR (engagement_score >= 0 AND engagement_score <= 100));
        END IF;

        -- Fit score constraint
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'check_fit_score_range'
        ) THEN
          ALTER TABLE pipeline_opportunities 
            ADD CONSTRAINT check_fit_score_range 
            CHECK (fit_score IS NULL OR (fit_score >= 0 AND fit_score <= 100));
        END IF;

        -- Stage probability constraint
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'check_stage_probability_range'
        ) THEN
          ALTER TABLE pipeline_opportunities 
            ADD CONSTRAINT check_stage_probability_range 
            CHECK (stage_probability IS NULL OR (stage_probability >= 0 AND stage_probability <= 100));
        END IF;

        -- Intent score constraint (existing field, now constrained)
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'check_intent_score_range'
        ) THEN
          ALTER TABLE pipeline_opportunities 
            ADD CONSTRAINT check_intent_score_range 
            CHECK (intent_score IS NULL OR (intent_score >= 0 AND intent_score <= 100));
        END IF;
      END $$;
    `);

    console.log("✅ Intelligent Sales Operating System schema constraints initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing Intelligent Sales Operating System schema:", error);
    throw error;
  }
}
