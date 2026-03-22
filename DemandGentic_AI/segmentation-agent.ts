import {
  VertexAI,
  FunctionDeclarationSchemaType,
  Part,
} from '@google-cloud/vertexai';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const vertexAI = new VertexAI({
  project: process.env.GCLOUD_PROJECT || 'your-gcp-project-id',
  location: process.env.GCLOUD_LOCATION || 'us-central1',
});

const model = 'gemini-1.5-pro-preview-0409';

// --- Helper Function to build a Prisma query from the AI's JSON output ---
function buildPrismaWhere(definition: any): any {
  if (!definition || !definition.rules || definition.rules.length === 0) {
    return {};
  }
  const conditionKey = definition.condition?.toUpperCase() === 'OR' ? 'OR' : 'AND';

  const rules = definition.rules
    .map((rule: any) => {
      const { field, operator, value } = rule;
      if (!field || !operator || value === undefined) return null;

      const fieldParts = field.split('.');
      let currentFilter: any = {};
      const filterObject = currentFilter;

      for (let i = 0; i  r !== null);

  return { [conditionKey]: rules };
}

// --- Define Tools for the Agent ---

const createSegment = async (args: {
  name: string;
  description: string;
  entityType: 'contact' | 'account';
  definitionJson: object;
}) => {
  console.log('[Tool] Creating segment:', args.name);
  try {
    const segment = await prisma.segment.create({
      data: {
        name: args.name,
        description: args.description,
        entityType: args.entityType,
        definitionJson: args.definitionJson as any,
      },
    });
    console.log('[Tool] Segment created successfully:', segment.id);
    return segment;
  } catch (e) {
    console.error('[Tool Error] createSegment:', e);
    return { error: 'Failed to create segment in database.' };
  }
};

const getAudienceReach = async (args: {
  entityType: 'contact' | 'account';
  definitionJson: object;
}) => {
  console.log('[Tool] Calculating audience reach for:', args.definitionJson);
  const whereClause = buildPrismaWhere(args.definitionJson);
  try {
    let count = 0;
    if (args.entityType === 'contact') {
      count = await prisma.contact.count({ where: whereClause });
    } else {
      count = await prisma.account.count({ where: whereClause });
    }
    console.log(`[Tool] Audience reach is: ${count}`);
    return { reach: count };
  } catch (e) {
    console.error('[Tool Error] getAudienceReach:', e);
    return { error: 'Database query for reach calculation failed.' };
  }
};

const availableTools = {
  createSegment,
  getAudienceReach,
};

// --- Define Tool Schemas for the Model ---

const tools = [
  {
    functionDeclarations: [
      {
        name: 'createSegment',
        description: 'Creates a new dynamic segment based on a structured JSON query.',
        parameters: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            name: { type: FunctionDeclarationSchemaType.STRING },
            description: { type: FunctionDeclarationSchemaType.STRING },
            entityType: { type: FunctionDeclarationSchemaType.STRING, enum: ['contact', 'account'] },
            definitionJson: {
              type: FunctionDeclarationSchemaType.OBJECT,
              description: 'The JSON object defining the segment rules.',
            },
          },
          required: ['name', 'entityType', 'definitionJson'],
        },
      },
      {
        name: 'getAudienceReach',
        description: 'Calculates the potential number of records that match a given JSON query definition.',
        parameters: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            entityType: { type: FunctionDeclarationSchemaType.STRING, enum: ['contact', 'account'] },
            definitionJson: {
              type: FunctionDeclarationSchemaType.OBJECT,
              description: 'The JSON object defining the segment rules.',
            },
          },
          required: ['entityType', 'definitionJson'],
        },
      },
    ],
  },
];

// --- Create the Main Agentic Function ---

export async function createSegmentFromNaturalLanguage(userPrompt: string) {
  const generativeModel = vertexAI.getGenerativeModel({ model, tools });
  const chat = generativeModel.startChat();

  const prompt = `You are an AI Segmentation Specialist. Your task is to convert a user's natural language request into a structured JSON query, create a dynamic Segment, and calculate its reach.

    The JSON query format is:
    {
      "condition": "AND" | "OR",
      "rules": [
        { "field": "fieldName", "operator": "operatorName", "value": "fieldValue" }
      ]
    }

    Available Contact fields: "jobTitle", "country".
    Available Account fields: "industry", "employeeSize".
    When filtering on Account fields for a Contact segment, prefix the field with "account.", e.g., "account.employeeSize".

    Available operators: "equals", "contains", "greater_than", "less_than".

    User Request: "${userPrompt}"

    Follow these steps:
    1. Parse the user request to determine a segment name, description, entity type ('contact' or 'account'), and filter rules.
    2. Construct the 'definitionJson' object.
    3. Call the 'createSegment' tool with the extracted information.
    4. After creating the segment, call the 'getAudienceReach' tool with the same 'definitionJson' to get the count.
    5. Finally, respond to the user in a friendly tone, confirming the segment has been created and state its potential reach. For example: "I've created the segment 'UK CFOs' for you. The potential audience reach is 1,234 contacts."`;

  console.log(`[Agent] Starting segmentation for prompt: "${userPrompt}"`);
  const result = await chat.sendMessage(prompt);

  // This simplified flow assumes the model calls the tools and then provides a final text answer.
  // A more complex loop would be needed for multi-step conversations.
  const calls = result.response.functionCalls();
  if (calls && calls.length > 0) {
    console.log(`[Agent] Model wants to call ${calls.length} function(s).`);
    const functionResponses: Part[] = [];
    for (const call of calls) {
      // @ts-ignore
      const toolFunction = availableTools[call.name];
      if (toolFunction) {
        const apiResponse = await toolFunction(call.args);
        functionResponses.push({
          functionResponse: { name: call.name, response: { name: call.name, content: apiResponse } },
        });
      }
    }

    // Send responses back to the model to get the final summary
    const finalResult = await chat.sendMessage(functionResponses);
    const finalResponseText = finalResult.response.text();
    console.log('[Agent] Final Response:', finalResponseText);
    return { success: true, response: finalResponseText };
  }

  console.error('[Agent] Model did not request a function call.');
  return { success: false, error: 'Could not interpret the request.' };
}