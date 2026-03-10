/**
 * Gemini Live API Connection Diagnostic
 *
 * Run: npx tsx scripts/diagnose-gemini-connection.ts
 *
 * Tests:
 * 1. Environment variables (API key, project ID)
 * 2. AI model governance policy (what model/provider is configured)
 * 3. Vertex AI WebSocket connection
 * 4. Gemini setup message (model availability)
 * 5. Alternative model names if primary fails
 */

import "dotenv/config";
import WebSocket from "ws";
import { GoogleAuth } from "google-auth-library";

// ── Helpers ──────────────────────────────────────────────────────────────

function log(emoji: string, msg: string) {
  console.log(`${emoji}  ${msg}`);
}

function logSection(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

// ── 1. Environment Check ─────────────────────────────────────────────

function checkEnvironment(): { hasApiKey: boolean; hasProjectId: boolean; projectId: string; location: string; apiKey: string } {
  logSection("1. Environment Variables");

  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || "";
  const location = process.env.VERTEX_AI_LOCATION || "us-central1";
  const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
  const geminiLiveModel = process.env.GEMINI_LIVE_MODEL || "(not set)";
  const voiceProvider = process.env.VOICE_PROVIDER || "(not set)";
  const publicWsUrl = process.env.PUBLIC_WEBSOCKET_URL || "(not set)";
  const publicTexmlHost = process.env.PUBLIC_TEXML_HOST || "(not set)";
  const texmlAppId = process.env.TELNYX_TEXML_APP_ID || "(not set)";

  log(apiKey ? "✅" : "❌", `GEMINI_API_KEY: ${apiKey ? "present (" + apiKey.substring(0, 8) + "...)" : "MISSING"}`);
  log(projectId ? "✅" : "⚠️", `GOOGLE_CLOUD_PROJECT: ${projectId || "MISSING (will use Google AI Studio instead of Vertex AI)"}`);
  log("ℹ️", `VERTEX_AI_LOCATION: ${location}`);
  log(credentialsFile ? "✅" : "⚠️", `GOOGLE_APPLICATION_CREDENTIALS: ${credentialsFile || "MISSING (using ADC)"}`);
  log("ℹ️", `GEMINI_LIVE_MODEL (env): ${geminiLiveModel}`);
  log("ℹ️", `VOICE_PROVIDER (env): ${voiceProvider}`);
  log("ℹ️", `PUBLIC_WEBSOCKET_URL: ${publicWsUrl}`);
  log("ℹ️", `PUBLIC_TEXML_HOST: ${publicTexmlHost}`);
  log("ℹ️", `TELNYX_TEXML_APP_ID: ${texmlAppId}`);

  const hasApiKey = !!apiKey;
  const hasProjectId = !!projectId;
  const useVertexAI = hasProjectId;

  log("ℹ️", `Mode: ${useVertexAI ? "Vertex AI (OAuth2)" : "Google AI Studio (API Key)"}`);

  if (!hasApiKey && !hasProjectId) {
    log("❌", "CRITICAL: Neither API key nor Project ID configured. Gemini CANNOT connect.");
  }

  return { hasApiKey, hasProjectId, projectId, location, apiKey };
}

// ── 2. Governance Policy Check ───────────────────────────────────────

async function checkGovernancePolicy(): Promise<string> {
  logSection("2. AI Model Governance Policy");

  try {
    // Import the governance module
    const { getAiModelGovernanceSnapshot } = await import("../server/services/ai-model-governance");
    const snapshot = await getAiModelGovernanceSnapshot(true); // Force refresh

    const policy = snapshot.policies.voice_realtime;
    log("ℹ️", `Source: ${snapshot.isSystemDefault ? "System Default (no DB record)" : "Database Record"}`);
    log("ℹ️", `Enabled: ${policy.enabled}`);
    log("ℹ️", `Primary Provider: ${policy.primaryProvider}`);
    log("ℹ️", `Primary Model: ${policy.primaryModel}`);
    log("ℹ️", `Fallback Enabled: ${policy.allowFallback}`);
    if (policy.allowFallback && policy.fallbackProvider) {
      log("ℹ️", `Fallback Provider: ${policy.fallbackProvider}`);
      log("ℹ️", `Fallback Model: ${policy.fallbackModel || "(none)"}`);
    }

    if (!policy.enabled) {
      log("⚠️", "Voice realtime policy is DISABLED — system defaults will be used");
    }

    return policy.primaryModel;
  } catch (err: any) {
    log("❌", `Failed to load governance policy: ${err.message}`);
    log("ℹ️", "Using hardcoded default: gemini-live-2.5-flash-native-audio");
    return "gemini-live-2.5-flash-native-audio";
  }
}

// ── 3. Gemini WebSocket Connection Test ──────────────────────────────

interface TestResult {
  model: string;
  connected: boolean;
  setupComplete: boolean;
  error: string | null;
  latencyMs: number;
}

async function testGeminiConnection(
  model: string,
  env: { hasApiKey: boolean; hasProjectId: boolean; projectId: string; location: string; apiKey: string },
): Promise<TestResult> {
  const start = Date.now();
  const useVertexAI = env.hasProjectId;

  return new Promise(async (resolve) => {
    const result: TestResult = {
      model,
      connected: false,
      setupComplete: false,
      error: null,
      latencyMs: 0,
    };

    const timeout = setTimeout(() => {
      result.error = "Connection timeout (15s)";
      result.latencyMs = Date.now() - start;
      ws?.terminate();
      resolve(result);
    }, 15000);

    let ws: WebSocket | null = null;

    try {
      let wsUrl: string;
      const headers: Record<string, string> = {};

      if (useVertexAI) {
        const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
        const accessToken = await auth.getAccessToken();
        if (!accessToken) {
          clearTimeout(timeout);
          result.error = "Failed to get Google Cloud access token (check credentials)";
          result.latencyMs = Date.now() - start;
          resolve(result);
          return;
        }
        wsUrl = `wss://${env.location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
        headers["Authorization"] = `Bearer ${accessToken}`;
      } else {
        wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${env.apiKey}`;
      }

      log("🔌", `Connecting to: ${wsUrl.replace(/key=[^&]+/, "key=***")}`);
      ws = new WebSocket(wsUrl, { headers });

      ws.on("open", () => {
        result.connected = true;
        log("✅", `WebSocket connected (+${Date.now() - start}ms)`);

        // Send setup message
        const modelResourceName = useVertexAI
          ? `projects/${env.projectId}/locations/${env.location}/publishers/google/models/${model}`
          : `models/${model}`;

        const setup = useVertexAI
          ? {
              setup: {
                model: modelResourceName,
                generationConfig: {
                  responseModalities: ["AUDIO"],
                  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
                  temperature: 0.7,
                },
                systemInstruction: { parts: [{ text: "You are a test assistant. Say hello." }] },
                tools: [],
                realtimeInputConfig: {
                  automaticActivityDetection: { disabled: false },
                },
                outputAudioTranscription: {},
                inputAudioTranscription: {},
              },
            }
          : {
              setup: {
                model: modelResourceName,
                generation_config: {
                  response_modalities: ["AUDIO"],
                  speech_config: { voice_config: { prebuilt_voice_config: { voice_name: "Kore" } } },
                  temperature: 0.7,
                },
                system_instruction: { parts: [{ text: "You are a test assistant. Say hello." }] },
                tools: { function_declarations: [] },
                realtime_input_config: {
                  automatic_activity_detection: { disabled: false },
                },
                output_audio_transcription: {},
                input_audio_transcription: {},
              },
            };

        log("📤", `Sending setup message with model: ${modelResourceName}`);
        ws!.send(JSON.stringify(setup));
      });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.setupComplete || msg.setup_complete) {
            result.setupComplete = true;
            result.latencyMs = Date.now() - start;
            log("✅", `SETUP COMPLETE received (+${result.latencyMs}ms) — Model "${model}" is WORKING`);
            clearTimeout(timeout);
            ws?.close();
            resolve(result);
            return;
          }

          if (msg.error) {
            result.error = `API Error: ${msg.error.message || JSON.stringify(msg.error)}`;
            result.latencyMs = Date.now() - start;
            log("❌", `API Error: ${JSON.stringify(msg.error)}`);
            clearTimeout(timeout);
            ws?.close();
            resolve(result);
            return;
          }

          // Log unexpected messages
          const msgStr = JSON.stringify(msg).substring(0, 200);
          log("📬", `Received: ${msgStr}`);
        } catch (e) {
          log("⚠️", `Failed to parse message: ${data.toString().substring(0, 100)}`);
        }
      });

      ws.on("close", (code, reason) => {
        if (!result.setupComplete && !result.error) {
          result.error = `WebSocket closed before setup_complete (code=${code}, reason=${reason?.toString() || "none"})`;
          result.latencyMs = Date.now() - start;
          log("❌", result.error);
          clearTimeout(timeout);
          resolve(result);
        }
      });

      ws.on("error", (err: any) => {
        result.error = `WebSocket error: ${err.message}`;
        result.latencyMs = Date.now() - start;
        log("❌", result.error);
        if (err.message?.includes("401") || err.message?.includes("403")) {
          log("🔑", "Authentication failed — check your credentials");
        }
        if (err.message?.includes("404")) {
          log("🔍", "Model/endpoint not found — model may be deprecated");
        }
        clearTimeout(timeout);
        resolve(result);
      });
    } catch (err: any) {
      clearTimeout(timeout);
      result.error = `Connection setup failed: ${err.message}`;
      result.latencyMs = Date.now() - start;
      resolve(result);
    }
  });
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║    Gemini Live API Connection Diagnostic                ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // Step 1: Check environment
  const env = checkEnvironment();

  if (!env.hasApiKey && !env.hasProjectId) {
    log("❌", "\nCANNOT PROCEED: No credentials configured.");
    process.exit(1);
  }

  // Step 2: Check governance policy
  let governanceModel: string;
  try {
    governanceModel = await checkGovernancePolicy();
  } catch {
    governanceModel = "gemini-live-2.5-flash-native-audio";
  }

  // Step 3: Test primary model
  logSection("3. Testing Primary Model Connection");
  log("🧪", `Testing model: ${governanceModel}`);
  const primaryResult = await testGeminiConnection(governanceModel, env);

  if (primaryResult.setupComplete) {
    logSection("DIAGNOSIS: Primary Model WORKING");
    log("✅", `Model "${governanceModel}" is operational.`);
    log("ℹ️", "If calls are still silent, check:");
    log("  ", "• WebSocket URL reachability (PUBLIC_WEBSOCKET_URL)");
    log("  ", "• Telnyx TeXML app configuration");
    log("  ", "• Server logs for errors in voice-dialer.ts");
    log("  ", "• Nginx/reverse proxy WebSocket upgrade support");
    process.exit(0);
  }

  // Step 4: Test alternative models
  logSection("4. Testing Alternative Models");
  log("⚠️", `Primary model "${governanceModel}" FAILED: ${primaryResult.error}`);
  log("🔄", "Trying alternative Gemini Live model names...\n");

  const alternativeModels = [
    "gemini-2.5-flash-preview-native-audio-dialog",
    "gemini-2.5-flash-native-audio-preview",
    "gemini-2.0-flash-live-001",
    "gemini-2.0-flash-live",
  ];

  let workingModel: string | null = null;

  for (const altModel of alternativeModels) {
    if (altModel === governanceModel) continue; // Skip if same as primary
    log("🧪", `Testing: ${altModel}`);
    const altResult = await testGeminiConnection(altModel, env);
    if (altResult.setupComplete) {
      workingModel = altModel;
      break;
    }
    log("❌", `  Failed: ${altResult.error}`);
  }

  // Step 5: Summary
  logSection("DIAGNOSIS SUMMARY");

  if (workingModel) {
    log("🎯", `FOUND WORKING MODEL: "${workingModel}"`);
    log("⚠️", `Current model "${governanceModel}" is NOT working.`);
    log("🔧", "FIX: Update the model in one of these ways:");
    log("  ", `1. Database: UPDATE ai_model_governance SET policies = jsonb_set(policies, '{voice_realtime,primaryModel}', '"${workingModel}"')`);
    log("  ", `2. Code: Update DEFAULT_AI_MODEL_POLICIES in shared/ai-governance.ts`);
    log("  ", `3. Admin UI: Go to AI Model Governance settings and change the voice model`);
  } else {
    log("❌", "NO WORKING MODEL FOUND. Possible causes:");
    log("  ", "• Google Cloud credentials expired or revoked");
    log("  ", "• Vertex AI API not enabled for this project");
    log("  ", "• Quota exhausted for BidiGenerateContent");
    log("  ", "• Network firewall blocking WebSocket connections to Google");
    log("  ", "• Service account missing aiplatform.* permissions");
    log("🔧", "NEXT STEPS:");
    log("  ", "1. Check Google Cloud Console → APIs & Services → Credentials");
    log("  ", "2. Run: gcloud auth application-default print-access-token");
    log("  ", "3. Check quotas: gcloud alpha services quota list --service=aiplatform.googleapis.com");
    log("  ", "4. Verify API enabled: gcloud services list --enabled | grep aiplatform");
  }

  process.exit(workingModel ? 0 : 1);
}

main().catch((err) => {
  console.error("Diagnostic failed:", err);
  process.exit(1);
});
