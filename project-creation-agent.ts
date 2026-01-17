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

// 1. Define the Tool (the function the AI can call)
// This function takes structured data and creates project/campaigns in the DB.
const createProjectAndCampaigns = async (args: {
  clientName: string;
  leadGoal: number;
  costPerLead: number;
  startDate: string;
  deliveryMethod: string;
  campaigns: Array<{ name: string; type: 'Email' | 'Call'; targetAudience: object }>;
  originalPrompt: string;
}) => {
  console.log('[Tool] Creating project draft with args:', args);
  try {
    const project = await prisma.project.create({
      data: {
        clientName: args.clientName,
        leadGoal: args.leadGoal,
        costPerLead: args.costPerLead,
        startDate: new Date(args.startDate),
        deliveryMethod: args.deliveryMethod,
        originalPrompt: args.originalPrompt,
        status: 'Draft',
        campaigns: {
          create: args.campaigns.map(campaign => ({
            name: campaign.name,
            type: campaign.type,
            targetAudience: campaign.targetAudience,
          })),
        },
      },
      include: {
        campaigns: true, // Include created campaigns in the return value
      },
    });
    console.log('[Tool] Successfully created project:', project);
    return project;
  } catch (e) {
    console.error('[Tool Error] createProjectAndCampaigns:', e);
    return { error: 'Failed to create project in database.' };
  }
};

const availableTools = {
  createProjectAndCampaigns,
};

// 2. Define the Tool Schema for the Model
const tools = [
  {
    functionDeclarations: [
      {
        name: 'createProjectAndCampaigns',
        description:
          'Creates a new project draft and its associated campaigns based on a user request. Extracts all details like client, goals, and target audience.',
        parameters: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            clientName: { type: FunctionDeclarationSchemaType.STRING },
            leadGoal: { type: FunctionDeclarationSchemaType.NUMBER },
            costPerLead: { type: FunctionDeclarationSchemaType.NUMBER },
            startDate: {
              type: FunctionDeclarationSchemaType.STRING,
              description: 'The starting date for the project, in YYYY-MM-DD format.',
            },
            deliveryMethod: { type: FunctionDeclarationSchemaType.STRING },
            campaigns: {
              type: FunctionDeclarationSchemaType.ARRAY,
              items: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                  name: { type: FunctionDeclarationSchemaType.STRING },
                  type: {
                    type: FunctionDeclarationSchemaType.STRING,
                    enum: ['Email', 'Call'],
                  },
                  targetAudience: {
                    type: FunctionDeclarationSchemaType.OBJECT,
                    description: 'A JSON object describing the target audience criteria, like job titles, company size, or location.',
                  },
                },
              },
            },
            originalPrompt: { type: FunctionDeclarationSchemaType.STRING },
          },
          required: ['clientName', 'leadGoal', 'costPerLead', 'campaigns', 'originalPrompt'],
        },
      },
    ],
  },
];

// 3. Create the main Agentic Function
export async function createProjectFromNaturalLanguage(userPrompt: string) {
  const agentName = 'project-creation-agent';

  // Fetch the dynamic prompt from the database
  const systemPrompt = await prisma.systemPrompt.findFirst({
    where: { agentName: agentName, isActive: true },
    orderBy: { version: 'desc' },
  });

  if (!systemPrompt) {
    console.error(`[Agent] No active system prompt found for '${agentName}'.`);
    return { success: false, error: `Agent '${agentName}' is not configured.` };
  }

  const generativeModel = vertexAI.getGenerativeModel({ model, tools });
  const chat = generativeModel.startChat();

  // Use the fetched prompt, injecting dynamic values
  const prompt = systemPrompt.promptText
    .replace('{{userPrompt}}', userPrompt)
    .replace('{{currentDate}}', new Date().toISOString().split('T')[0]);

  console.log(`[Agent] Starting project creation for agent '${agentName}' (v${systemPrompt.version}) from prompt: "${userPrompt}"`);
  const result = await chat.sendMessage(prompt);

  const call = result.response.functionCalls()?.[0];

  if (call) {
    console.log('[Agent] Model wants to call function:', call.name);
    // @ts-ignore
    const toolFunction = availableTools[call.name];
    if (toolFunction) {
      const apiResponse = await toolFunction(call.args);
      // In a real app, you might send this response back to the model for confirmation
      return { success: true, data: apiResponse };
    }
  }

  console.error('[Agent] Model did not request a function call.');
  return { success: false, error: 'Could not interpret the request.' };
}