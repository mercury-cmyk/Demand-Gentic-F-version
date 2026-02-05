import {
  VertexAI,
  FunctionDeclarationSchemaType,
  Part,
} from '@google-cloud/vertexai';
// Import the Prisma Client
import { PrismaClient } from '@prisma/client';

// Instantiate the Prisma Client to interact with your database
const prisma = new PrismaClient();

// 1. Initialize Vertex AI Client
// It's best practice to use environment variables for project and location.
const vertexAI = new VertexAI({
  project: process.env.GCLOUD_PROJECT || 'your-gcp-project-id', // Replace with your GCP project ID
  location: process.env.GCLOUD_LOCATION || 'us-central1',
});

const model = 'gemini-1.5-pro-preview-0409'; // A powerful model that supports function calling

// 2. Define Functions (Tools) that connect to the database
const getOpportunityDetails = async (args: { opportunityId: string }) => {
  console.log(`[Tool] Fetching details for opportunity: ${args.opportunityId}`);
  try {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: args.opportunityId },
    });
    return opportunity || { error: 'Opportunity not found' };
  } catch (e) {
    console.error('[Tool Error] getOpportunityDetails:', e);
    return { error: 'Database query failed.' };
  }
};

const getCommunicationHistory = async (args: { opportunityId: string }) => {
  console.log(
    `[Tool] Fetching communication history for: ${args.opportunityId}`
  );
  try {
    const history = await prisma.communicationHistory.findMany({
      where: { opportunityId: args.opportunityId },
      orderBy: { date: 'desc' },
      take: 20, // Limit to the last 20 communications
    });
    return history;
  } catch (e) {
    console.error('[Tool Error] getCommunicationHistory:', e);
    return { error: 'Database query failed.' };
  }
};

const availableTools = {
  getOpportunityDetails,
  getCommunicationHistory,
};

// 3. Define Tool Schemas for the Model
const tools = [
  {
    functionDeclarations: [
      {
        name: 'getOpportunityDetails',
        description:
          'Get the core details of a sales opportunity like value, stage, owner, and last contact date.',
        parameters: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            opportunityId: {
              type: FunctionDeclarationSchemaType.STRING,
              description: 'The unique identifier for the opportunity.',
            },
          },
          required: ['opportunityId'],
        },
      },
      {
        name: 'getCommunicationHistory',
        description:
          'Retrieves the recent communication history (emails, calls) for a specific opportunity.',
        parameters: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            opportunityId: {
              type: FunctionDeclarationSchemaType.STRING,
              description: 'The unique identifier for the opportunity.',
            },
          },
          required: ['opportunityId'],
        },
      },
    ],
  },
];

// 4. Create the Agentic Function
export async function analyzeOpportunity(opportunityId: string) {
  const generativeModel = vertexAI.getGenerativeModel({
    model: model,
    tools: tools,
  });

  const chat = generativeModel.startChat();

  const prompt = `You are a world-class AI Sales Assistant. Your goal is to analyze a sales opportunity and provide a concise, actionable recommendation for the sales representative.

    Analyze the opportunity with ID: ${opportunityId}.

    1. First, gather all necessary information about the opportunity and its communication history using the available tools. You should call both 'getOpportunityDetails' and 'getCommunicationHistory'.
    2. Based on the data, assess the deal's health. Consider factors like the time since the last meaningful interaction. A deal with no reply for over 14 days is at high risk.
    3. Provide a "Next Best Action" for the sales rep. Be specific and creative. For example, instead of "follow up", suggest "Send an email referencing a recent company announcement and ask if the proposal aligns with their new goals."
    4. Provide a "Risk Assessment" (e.g., Low, Medium, High) and a brief justification.
    5. Format your final output in Markdown.`;

  console.log(`[Agent] Starting analysis for opportunity: ${opportunityId}`);
  let result = await chat.sendMessageStream(prompt);

  let finalResponse = '';

  // This robust loop handles the back-and-forth conversation with the model,
  // including multiple sequential or parallel function calls.
  while (true) {
    let aggregatedResponseText = '';
    const functionCalls: any[] = [];

    // Stream the response to find function calls or text
    for await (const item of result.stream) {
      if (item.candidates?.[0].content.parts[0].functionCall) {
        functionCalls.push(item.candidates[0].content.parts[0].functionCall);
      } else if (item.candidates?.[0].content.parts[0].text) {
        aggregatedResponseText += item.candidates[0].content.parts[0].text;
      }
    }

    // If the model made function calls, execute them
    if (functionCalls.length > 0) {
      console.log(
        `[Agent] Model wants to call ${functionCalls.length} function(s):`,
        functionCalls.map(fc => fc.name)
      );

      const functionResponses: Part[] = [];

      for (const funcCall of functionCalls) {
        const { name, args } = funcCall;
        // @ts-ignore
        const toolFunction = availableTools[name];

        if (toolFunction) {
          const apiResponse = await toolFunction(args);
          functionResponses.push({
            functionResponse: {
              name,
              response: { name, content: apiResponse },
            },
          });
        } else {
          console.error(`[Agent] Unknown function call: ${name}`);
        }
      }

      // Send the function responses back to the model
      result = await chat.sendMessageStream(functionResponses);
    } else {
      // If there are no more function calls, the text is the final answer
      finalResponse = aggregatedResponseText;
      break; // Exit the loop
    }
  }

  console.log('\n[Agent] Final Recommendation:\n');
  console.log(finalResponse);
  return finalResponse;
}