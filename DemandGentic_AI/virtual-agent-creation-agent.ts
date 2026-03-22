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

// --- 1. Define the Tool for the Agent ---

const createVirtualAgent = async (args: {
  name: string;
  personaPrompt: string;
  voiceId: string;
  capabilities: string[];
}) => {
  console.log('[Tool] Creating virtual agent:', args.name);
  try {
    const existingAgent = await prisma.agent.findUnique({
      where: { name: args.name },
    });
    if (existingAgent) {
      return { error: `An agent with the name '${args.name}' already exists.` };
    }

    const virtualAgent = await prisma.agent.create({
      data: {
        name: args.name,
        type: 'VIRTUAL',
        personaPrompt: args.personaPrompt,
        voiceId: args.voiceId,
        capabilities: args.capabilities,
      },
    });
    console.log('[Tool] Virtual agent created successfully:', virtualAgent.id);
    return virtualAgent;
  } catch (e) {
    console.error('[Tool Error] createVirtualAgent:', e);
    return { error: 'Failed to create virtual agent in database.' };
  }
};

const availableTools = {
  createVirtualAgent,
};

// --- 2. Define the Tool Schema for the Model ---

const tools = [
  {
    functionDeclarations: [
      {
        name: 'createVirtualAgent',
        description: 'Creates a new virtual (AI) agent in the system with a specific persona, voice, and capabilities.',
        parameters: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            name: { type: FunctionDeclarationSchemaType.STRING, description: 'A unique name for the agent.' },
            personaPrompt: { type: FunctionDeclarationSchemaType.STRING, description: 'The system prompt defining the agent\'s personality and goals.' },
            voiceId: { type: FunctionDeclarationSchemaType.STRING, description: 'The TTS voice ID for the agent.' },
            capabilities: {
              type: FunctionDeclarationSchemaType.ARRAY,
              description: 'An array of capabilities, e.g., ["LEAVE_VOICEMAIL"].',
              items: { type: FunctionDeclarationSchemaType.STRING },
            },
          },
          required: ['name', 'personaPrompt', 'voiceId', 'capabilities'],
        },
      },
    ],
  },
];

// --- 3. Create the Main Agentic Function ---

export async function createVirtualAgentFromNaturalLanguage(userPrompt: string) {
  const generativeModel = vertexAI.getGenerativeModel({ model, tools });
  const chat = generativeModel.startChat();

  const prompt = `You are an AI assistant that creates and configures other virtual AI agents for a call center.
    Your task is to parse the user's request and use the 'createVirtualAgent' tool to create a new virtual agent.

    User Request: "${userPrompt}"

    Follow these steps:
    1.  **Extract the Name:** Identify the name for the new virtual agent.
    2.  **Construct the Persona Prompt:** Based on the user's description of the agent's personality and goals, write a clear and concise system prompt for that agent.
    3.  **Select a Voice:** Choose the most appropriate voice ID from the available options based on the user's request (e.g., 'female', 'male', 'US', 'UK').
        Available Voices:
        - 'en-US-Wavenet-D' (Male, US, Standard)
        - 'en-US-Wavenet-F' (Female, US, Professional)
        - 'en-GB-Wavenet-B' (Male, UK, Standard)
        - 'en-GB-Wavenet-C' (Female, UK, Professional)
    4.  **Determine Capabilities:** Based on the task described, determine the agent's capabilities. If it involves leaving messages, use \`["LEAVE_VOICEMAIL"]\`.
    5.  Call the 'createVirtualAgent' tool with the extracted parameters.
    6.  After the tool call, if successful, confirm the creation to the user by summarizing what you did. If there was an error, state the error clearly.`;

  console.log(`[Agent] Starting virtual agent creation from prompt: "${userPrompt}"`);
  const result = await chat.sendMessage(prompt);

  const call = result.response.functionCalls()?.[0];

  if (call) {
    console.log('[Agent] Model wants to call function:', call.name);
    // @ts-ignore
    const toolFunction = availableTools[call.name];
    if (toolFunction) {
      const apiResponse = await toolFunction(call.args);

      // Send the result back to the model to get a natural language confirmation
      const finalResult = await chat.sendMessage([
        {
          functionResponse: {
            name: call.name,
            response: { name: call.name, content: apiResponse },
          },
        },
      ]);

      const confirmation = finalResult.response.text();
      console.log('[Agent] Final Response:', confirmation);
      return { success: !apiResponse.error, response: confirmation, data: apiResponse };
    }
  }

  console.error('[Agent] Model did not request a function call.');
  return { success: false, error: 'Could not interpret the request.' };
}