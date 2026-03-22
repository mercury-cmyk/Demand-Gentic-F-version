import {
  VertexAI,
  FunctionDeclarationSchemaType,
  Part,
} from '@google-cloud/vertexai';
import { AnomalySeverity, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const vertexAI = new VertexAI({
  project: process.env.GCLOUD_PROJECT || 'your-gcp-project-id',
  location: process.env.GCLOUD_LOCATION || 'us-central1',
});

const model = 'gemini-1.5-pro-preview-0409';

// --- 1. Define Tools for the Agent ---

const getRecentLogs = async (args: { lastMinutes: number }) => {
  console.log(`[Tool] Fetching logs from the last ${args.lastMinutes} minutes.`);
  try {
    const since = new Date(Date.now() - args.lastMinutes * 60 * 1000);
    const logs = await prisma.logEntry.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
      take: 200, // Limit to avoid overwhelming the model
    });
    console.log(`[Tool] Found ${logs.length} log entries.`);
    return logs;
  } catch (e) {
    console.error('[Tool Error] getRecentLogs:', e);
    return { error: 'Database query for logs failed.' };
  }
};

const reportAnomaly = async (args: {
  description: string;
  severity: AnomalySeverity;
  relatedLogIds: string[];
}) => {
  console.log(`[Tool] Reporting new anomaly with severity: ${args.severity}`);
  try {
    const anomaly = await prisma.anomaly.create({
      data: {
        description: args.description,
        severity: args.severity,
        relatedLogIds: args.relatedLogIds,
        status: 'NEW',
      },
    });
    console.log('[Tool] Anomaly reported successfully:', anomaly.id);
    return { success: true, anomalyId: anomaly.id };
  } catch (e) {
    console.error('[Tool Error] reportAnomaly:', e);
    return { error: 'Failed to create anomaly in database.' };
  }
};

const availableTools = {
  getRecentLogs,
  reportAnomaly,
};

// --- 2. Define Tool Schemas for the Model ---

const tools = [
  {
    functionDeclarations: [
      {
        name: 'getRecentLogs',
        description: 'Fetches recent log entries from the system for analysis.',
        parameters: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            lastMinutes: {
              type: FunctionDeclarationSchemaType.NUMBER,
              description: 'The time window in minutes to fetch logs from.',
            },
          },
          required: ['lastMinutes'],
        },
      },
      {
        name: 'reportAnomaly',
        description: 'Creates a new anomaly record in the system when a significant issue is detected.',
        parameters: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            description: { type: FunctionDeclarationSchemaType.STRING, description: 'A clear, concise summary of the detected anomaly.' },
            severity: { type: FunctionDeclarationSchemaType.STRING, enum: ['HIGH', 'MEDIUM', 'LOW'] },
            relatedLogIds: {
              type: FunctionDeclarationSchemaType.ARRAY,
              items: { type: FunctionDeclarationSchemaType.STRING },
              description: 'An array of IDs from the log entries that are relevant to this anomaly.',
            },
          },
          required: ['description', 'severity', 'relatedLogIds'],
        },
      },
    ],
  },
];

// --- 3. Create the Main Agentic Function ---

export async function analyzeRecentLogs(timeWindowInMinutes: number = 60) {
  const generativeModel = vertexAI.getGenerativeModel({ model, tools });
  const chat = generativeModel.startChat();

  const prompt = `You are an expert Site Reliability Engineer (SRE) tasked with monitoring our system's health by analyzing its logs. Your goal is to identify and report any anomalies that may indicate a problem.

    Begin by using the 'getRecentLogs' tool to fetch all logs from the last ${timeWindowInMinutes} minutes.

    Once you have the logs, analyze them for the following patterns:
    1.  **Error Spikes:** A sudden increase in the number of 'ERROR' level logs.
    2.  **New or Unusual Errors:** Any 'ERROR' messages that seem novel, critical, or are occurring in a service that is usually stable.
    3.  **High Latency Warnings:** Any 'WARN' or 'INFO' logs that mention high latency, timeouts, or slow performance (e.g., "query took >500ms").
    4.  **Critical Failures:** Any logs indicating a crash, unhandled exception, database connection failure, or authentication issue.

    If you identify a significant issue that requires human attention, you **MUST** use the 'reportAnomaly' tool. When reporting, provide a concise but informative description of the problem and include the IDs of the most relevant logs.

    If the logs show no signs of anomalies, your final response should be a simple confirmation, like "System health appears normal. No new anomalies detected in the last ${timeWindowInMinutes} minutes."`;

  console.log(`[Agent] Starting log analysis for the last ${timeWindowInMinutes} minutes.`);

  // This agentic loop will call tools and then generate a final text response
  let result = await chat.sendMessageStream(prompt);
  let finalResponse = '';

  while (true) {
    let aggregatedResponseText = '';
    const functionCalls: any[] = [];

    for await (const item of result.stream) {
      if (item.candidates?.[0].content.parts[0].functionCall) {
        functionCalls.push(item.candidates[0].content.parts[0].functionCall);
      } else if (item.candidates?.[0].content.parts[0].text) {
        aggregatedResponseText += item.candidates[0].content.parts[0].text;
      }
    }

    if (functionCalls.length > 0) {
      console.log(`[Agent] Model wants to call ${functionCalls.length} function(s):`, functionCalls.map(fc => fc.name));
      const functionResponses: Part[] = [];

      for (const funcCall of functionCalls) {
        // @ts-ignore
        const toolFunction = availableTools[funcCall.name];
        if (toolFunction) {
          const apiResponse = await toolFunction(funcCall.args);
          functionResponses.push({
            functionResponse: { name: funcCall.name, response: { name: funcCall.name, content: apiResponse } },
          });
        }
      }
      result = await chat.sendMessageStream(functionResponses);
    } else {
      finalResponse = aggregatedResponseText;
      break;
    }
  }

  console.log('\n[Agent] Final Analysis:\n', finalResponse);
  return { success: true, analysis: finalResponse };
}