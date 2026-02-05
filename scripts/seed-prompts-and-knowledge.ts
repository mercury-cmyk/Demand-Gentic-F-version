import { syncPromptDefinitions } from "../server/services/prompt-management-service";
import { ALL_PROMPT_DEFINITIONS } from "../server/services/prompt-loader";
import { seedDefaultKnowledgeBlocks } from "../server/services/knowledge-block-service";
import { resetToDefaultKnowledge, getUnifiedKnowledge } from "../server/services/unified-knowledge-hub";

async function main() {
  console.log("[Seed] Syncing prompt definitions...");
  const promptResults = await syncPromptDefinitions(ALL_PROMPT_DEFINITIONS, null);
  console.log("[Seed] Prompt sync results:", promptResults);

  console.log("[Seed] Seeding knowledge blocks...");
  const knowledgeBlockResults = await seedDefaultKnowledgeBlocks();
  console.log("[Seed] Knowledge block seed results:", knowledgeBlockResults);

  console.log("[Seed] Ensuring unified knowledge hub has a version...");
  const existing = await getUnifiedKnowledge();
  if (existing.version === 0 && existing.id === "default") {
    const reset = await resetToDefaultKnowledge(null);
    console.log("[Seed] Unified knowledge hub reset to defaults:", {
      version: reset.version,
      sections: reset.sections.length,
    });
  } else {
    console.log("[Seed] Unified knowledge hub already initialized:", {
      version: existing.version,
      sections: existing.sections.length,
    });
  }
}

main().catch((error) => {
  console.error("[Seed] Failed:", error);
  process.exit(1);
});
