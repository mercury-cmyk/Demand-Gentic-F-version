/**
 * Prompt Variant Generator Service
 * Generates multiple prompt variations from the same context using different perspectives
 * Uses Claude to create variations that emphasize different approaches
 */

import Anthropic from "@anthropic-ai/sdk";

type Perspective =
  | "consultative"
  | "direct_value"
  | "pain_point"
  | "social_proof"
  | "educational"
  | "urgent"
  | "relationship";

interface GenerationInput {
  agentName: string;
  baseGoal: string;
  tone?: string;
  targetAudience?: string;
  organizationName?: string;
  industry?: string;
  talkingPoints?: string[];
  objections?: string[];
  successCriteria?: string[];
}

interface GeneratedVariant {
  perspective: Perspective;
  variantName: string;
  systemPrompt: string;
  firstMessage: string;
}

/**
 * Generate multiple prompt variants from the same context
 * Creates 7 different perspectives to test different approaches
 */
export async function generateMultiplePromptVariants(
  input: GenerationInput,
  onlyPerspectives?: string[]
): Promise {
  const client = new Anthropic();

  const contextDescription = buildContextDescription(input);
  const requestedPerspectives = onlyPerspectives?.map((perspective) => perspective.toLowerCase()) ?? null;
  const requestedSet = requestedPerspectives ? new Set(requestedPerspectives) : null;

  const systemPrompt = `You are an expert AI prompt engineer specializing in outbound calling agents.
Your task is to generate different prompt variations from the same context, each emphasizing a different approach/perspective.

Guidelines:
- Each variant should have a distinct personality and approach while maintaining professional credibility
- System prompts should be concise but comprehensive (300-500 words)
- First messages should be engaging and natural (1-2 sentences)
- Each perspective should fundamentally change HOW the agent approaches the conversation
- All variants must be compliant with professional outbound calling best practices
- Include specific handling for objections, listening techniques, and call flow

Return valid JSON only, no markdown or explanations.`;

  const userPrompt = `Generate 7 distinct prompt variants for this agent context:

${contextDescription}

For each perspective, provide:
1. variantName: A catchy name (e.g., "The Consultant", "The Closer", "The Educator")
2. systemPrompt: The system prompt (300-500 words)
3. firstMessage: The opening line (natural, 1-2 sentences)

Perspectives to generate:
1. CONSULTATIVE: Ask questions, diagnose needs first, build understanding before pitching
2. DIRECT_VALUE: Lead with ROI and benefits, get straight to value proposition
3. PAIN_POINT: Focus on addressing specific pain points and frustrations
4. SOCIAL_PROOF: Lead with case studies, results, and similar companies' success
5. EDUCATIONAL: Teach and inform first, position as thought leader
6. URGENT: Create appropriate sense of urgency, limited time offers, market timing
7. RELATIONSHIP: Focus on building rapport and long-term relationship, personal touch

Return a JSON object with key "variants" containing an array of 7 objects.
Each object must have: { perspective, variantName, systemPrompt, firstMessage }`;

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  });

  const responseText =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  // Parse JSON response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse Claude response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const variants = parsed.variants || [];

  // Ensure all perspectives are present
  const perspectiveMap = {
    CONSULTATIVE: "consultative",
    DIRECT_VALUE: "direct_value",
    PAIN_POINT: "pain_point",
    SOCIAL_PROOF: "social_proof",
    EDUCATIONAL: "educational",
    URGENT: "urgent",
    RELATIONSHIP: "relationship",
  } as const;

  const normalizedVariants: GeneratedVariant[] = variants.map((variant: any) => {
    const mapped =
      perspectiveMap[variant.perspective as keyof typeof perspectiveMap] ||
      (typeof variant.perspective === "string" ? variant.perspective.toLowerCase() : "");

    return {
      perspective: mapped as Perspective,
      variantName: variant.variantName,
      systemPrompt: variant.systemPrompt,
      firstMessage: variant.firstMessage,
    };
  });

  if (!requestedSet) {
    return normalizedVariants;
  }

  return normalizedVariants.filter((variant) => requestedSet.has(variant.perspective));
}

/**
 * Generate a specific variant based on a perspective
 * Useful when you want to create a single variant with custom context
 */
export async function generateSingleVariant(
  perspective: Perspective,
  input: GenerationInput
): Promise {
  const client = new Anthropic();

  const contextDescription = buildContextDescription(input);

  const perspectiveGuides = {
    consultative:
      "Focus on asking discovery questions, understanding the prospect's current situation and challenges, then position solutions as answers to their specific needs. Build trust through genuine curiosity.",
    direct_value:
      "Lead with ROI and business value immediately. Show how your solution directly improves their metrics (revenue, efficiency, cost). Be specific with numbers and outcomes.",
    pain_point:
      "Identify and articulate their specific pain points and frustrations. Lead with 'I know companies like yours typically struggle with...' and offer relief.",
    social_proof:
      "Emphasize case studies, results from similar companies, and social proof. Lead with 'We recently helped [similar company] achieve...' to establish credibility.",
    educational:
      "Position yourself as a thought leader. Share industry insights, trends, and best practices. Focus on teaching them something valuable before discussing your solution.",
    urgent:
      "Create appropriate urgency around time-sensitive opportunities or limited availability. Focus on 'window of opportunity', competitive landscape, or seasonal timing.",
    relationship:
      "Prioritize building personal rapport and long-term relationship. Be warm, personable, and authentic. Focus on being helpful and establishing genuine connection first.",
  };

  const systemPrompt = `You are an expert AI prompt engineer specializing in outbound calling agents.
Generate a single prompt variant emphasizing the "${perspective}" approach.

Guidelines:
- Create an authentic personality that reflects this perspective
- System prompt should be 400-500 words, comprehensive yet concise
- First message should be natural and conversational (1-2 sentences)
- Include specific techniques for this perspective
- Maintain professional credibility and compliance

Return valid JSON only: { variantName, systemPrompt, firstMessage }`;

  const userPrompt = `Generate a prompt variant with the "${perspective}" perspective.

Perspective Focus:
${perspectiveGuides[perspective]}

Context:
${contextDescription}

Create a variant that authentically embodies this approach while maintaining professional credibility.
Return ONLY valid JSON with keys: variantName, systemPrompt, firstMessage`;

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  });

  const responseText =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  // Parse JSON response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse Claude response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    perspective,
    variantName: parsed.variantName,
    systemPrompt: parsed.systemPrompt,
    firstMessage: parsed.firstMessage,
  };
}

/**
 * Generate refinement for an existing variant based on feedback
 * Use when you want to improve a specific variant
 */
export async function refineVariant(
  currentVariant: string,
  feedback: string,
  input: GenerationInput
): Promise {
  const client = new Anthropic();

  const contextDescription = buildContextDescription(input);

  const systemPrompt = `You are an expert prompt engineer improving an AI agent prompt.
Refine the current variant based on the feedback provided.

Return valid JSON: { systemPrompt, firstMessage }`;

  const userPrompt = `Current variant:
${currentVariant}

Feedback to implement:
${feedback}

Context:
${contextDescription}

Improve the variant incorporating the feedback.
Return ONLY valid JSON with keys: systemPrompt, firstMessage`;

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  });

  const responseText =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse Claude response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    perspective: "direct_value", // Placeholder, update as needed
    variantName: "Refined Variant",
    systemPrompt: parsed.systemPrompt,
    firstMessage: parsed.firstMessage,
  };
}

/**
 * Build human-readable context description from input
 */
function buildContextDescription(input: GenerationInput): string {
  const parts = [
    `Agent Name: ${input.agentName}`,
    `Goal: ${input.baseGoal}`,
  ];

  if (input.organizationName) parts.push(`Organization: ${input.organizationName}`);
  if (input.industry) parts.push(`Industry: ${input.industry}`);
  if (input.targetAudience) parts.push(`Target Audience: ${input.targetAudience}`);
  if (input.tone) parts.push(`Tone: ${input.tone}`);

  if (input.talkingPoints && input.talkingPoints.length > 0) {
    parts.push(`\nKey Talking Points:\n${input.talkingPoints.map((p) => `- ${p}`).join("\n")}`);
  }

  if (input.objections && input.objections.length > 0) {
    parts.push(`\nCommon Objections to Handle:\n${input.objections.map((o) => `- ${o}`).join("\n")}`);
  }

  if (input.successCriteria && input.successCriteria.length > 0) {
    parts.push(`\nSuccess Criteria:\n${input.successCriteria.map((s) => `- ${s}`).join("\n")}`);
  }

  return parts.join("\n");
}