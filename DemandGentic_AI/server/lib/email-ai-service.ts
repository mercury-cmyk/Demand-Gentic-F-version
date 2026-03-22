import OpenAI from 'openai';

interface EmailAnalysisResult {
  overallScore: number;
  toneScore: number;
  clarityScore: number;
  professionalismScore: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  suggestions: string[];
  rewrittenVersion?: string;
}

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable.');
    }
    
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    });
  }
  return openaiClient;
}

export async function analyzeEmail(
  subject: string,
  body: string,
  recipientContext?: string
): Promise {
  const prompt = `You are an expert email communication analyst. Analyze the following business email and provide detailed feedback.

Subject: ${subject}

Body:
${body}

${recipientContext ? `Recipient Context: ${recipientContext}` : ''}

Please analyze this email and provide:
1. Overall quality score (0-100)
2. Tone score (0-100) - How appropriate and professional is the tone?
3. Clarity score (0-100) - How clear and easy to understand is the message?
4. Professionalism score (0-100) - How professional is the language and structure?
5. Sentiment (positive/neutral/negative)
6. 3-5 specific suggestions for improvement
7. Whether the email is ready to send (scores above 70 are generally good)

Respond ONLY with valid JSON in this exact format:
{
  "overallScore": 85,
  "toneScore": 90,
  "clarityScore": 80,
  "professionalismScore": 85,
  "sentiment": "positive",
  "suggestions": [
    "Consider adding a clear call-to-action in the closing",
    "The second paragraph could be more concise"
  ]
}`;

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an expert business communication analyst. Respond only with valid JSON.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 1000,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  const analysis = JSON.parse(content);
  return analysis;
}

export async function rewriteEmail(
  subject: string,
  body: string,
  improvements: string[]
): Promise {
  const prompt = `You are an expert business email writer. Rewrite the following email to address these improvement suggestions:

Original Subject: ${subject}

Original Body:
${body}

Improvements to apply:
${improvements.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Please rewrite the email to be clearer, more professional, and more effective while maintaining the original intent and key information.

Respond ONLY with valid JSON in this exact format:
{
  "subject": "Improved subject line",
  "body": "Improved email body with HTML formatting if appropriate"
}`;

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an expert business email writer. Respond only with valid JSON.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.5,
    max_tokens: 1500,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  const rewritten = JSON.parse(content);
  return rewritten;
}