import {
  VertexAI,
  FunctionDeclarationSchemaType,
  Part,
} from '@google-cloud/vertexai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const vertexAI = new VertexAI({
  project: process.env.GCLOUD_PROJECT || 'your-gcp-project-id',
  location: process.env.GCLOUD_LOCATION || 'us-central1',
});

const model = 'gemini-1.5-pro-preview-0409';

// --- 1. Define Tools for the Meta-Agent ---

const getAgentPrompt = async (args: { agentName: string }) => {
  console.log(`[MetaTool] Fetching prompt for agent: ${args.agentName}`);
  try {
    const systemPrompt = await prisma.systemPrompt.findFirst({
      where: { agentName: args.agentName, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!systemPrompt) {
      return { error: `No active prompt found for agent '${args.agentName}'.` };
    }
    return { promptText: systemPrompt.promptText, version: systemPrompt.version };
  } catch (e) {
    console.error('[MetaTool Error] getAgentPrompt:', e);
    return { error: 'Database query for prompt failed.' };
  }
};

const updateAgentPrompt = async (args: { agentName: string; newPromptText: string }) => {
  console.log(`[MetaTool] Updating prompt for agent: ${args.agentName}`);
  try {
    const current = await prisma.systemPrompt.findFirst({
      where: { agentName: args.agentName },
      orderBy: { version: 'desc' },
    });

    const currentVersion = current?.version || 0;

    // Deactivate old prompts
    await prisma.systemPrompt.updateMany({
      where: { agentName: args.agentName },
      data: { isActive: false },
    });

    // Create new active prompt with incremented version
    const newPrompt = await prisma.systemPrompt.create({
      data: {
        agentName: args.agentName,
        promptText: args.newPromptText,
        version: currentVersion + 1,
        isActive: true,
      },
    });
    console.log(`[MetaTool] Prompt for '${args.agentName}' updated to version ${newPrompt.version}.`);
    return { success: true, newVersion: newPrompt.version };
  } catch (e) {
    console.error('[MetaTool Error] updateAgentPrompt:', e);
    return { error: 'Failed to update prompt in database.' };
  }
};

const availableTools = {
  getAgentPrompt,
  updateAgentPrompt,
};

// --- 2. Define Tool Schemas for the Meta-Model ---

const tools = [
  {
    functionDeclarations: [
      {
        name: 'getAgentPrompt',
        description: 'Fetches the current active system prompt for a specified agent.',
        parameters: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            agentName: { type: FunctionDeclarationSchemaType.STRING, description: 'The unique name of the agent whose prompt is being fetched.' },
          },
          required: ['agentName'],
        },
      },
      {
        name: 'updateAgentPrompt',
        description: 'Updates the system prompt for a specified agent. This creates a new version and deactivates the old one.',
        parameters: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            agentName: { type: FunctionDeclarationSchemaType.STRING, description: 'The unique name of the agent being updated.' },
            newPromptText: { type: FunctionDeclarationSchemaType.STRING, description: 'The new, improved text for the system prompt.' },
          },
          required: ['agentName', 'newPromptText'],
        },
      },
    ],
  },
];

// --- 3. Create the Main Meta-Agent Function ---

export async function optimizeAgentPrompt(agentName: string, feedback: string) {
  const generativeModel = vertexAI.getGenerativeModel({ model, tools });
  const chat = generativeModel.startChat();

  const metaPrompt = `You are a "Prompt Optimizer" agent. Your purpose is to improve the system prompts of other AI agents based on performance feedback.

    Agent to optimize: "${agentName}"
    User Feedback: "${feedback}"

    Follow these steps:
    1.  Use the 'getAgentPrompt' tool to retrieve the current prompt for the specified agent.
    2.  Carefully analyze the current prompt and the user's feedback. Identify the shortcomings of the current prompt.
    3.  Rewrite the prompt to address the feedback. Your goal is to make the agent more accurate, efficient, or better at its task. Be specific in your changes. Do not just add the feedback to the prompt; integrate the lesson from the feedback into the prompt's instructions.
    4.  Use the 'updateAgentPrompt' tool to save the new, improved prompt.
    5.  Finally, respond with a summary of the changes you made and why. Explain how the new prompt addresses the feedback.`;

  console.log(`[MetaAgent] Starting optimization for agent '${agentName}' based on feedback: "${feedback}"`);

  // This simplified agentic loop handles a two-step (get, then update) process.
  const result = await chat.sendMessage(metaPrompt);

  const call = result.response.functionCalls()?.[0];
  if (call && call.name === 'getAgentPrompt') {
    console.log('[MetaAgent] Model wants to call function:', call.name);
    const apiResponse = await getAgentPrompt(call.args);
    const secondResult = await chat.sendMessage([
      { functionResponse: { name: call.name, response: { name: call.name, content: apiResponse } } },
    ]);
    
    const secondCall = secondResult.response.functionCalls()?.[0];
    if (secondCall && secondCall.name === 'updateAgentPrompt') {
       console.log('[MetaAgent] Model wants to call function:', secondCall.name);
       const secondApiResponse = await updateAgentPrompt(secondCall.args);
       const finalResult = await chat.sendMessage([
        { functionResponse: { name: secondCall.name, response: { name: secondCall.name, content: secondApiResponse } } },
       ]);
       const summary = finalResult.response.text();
       console.log('[MetaAgent] Final Summary:', summary);
       return { success: true, summary: summary };
    }
  }

  console.error('[MetaAgent] Model did not follow the expected sequence of function calls.');
  return { success: false, error: 'Could not interpret the request correctly.' };
}