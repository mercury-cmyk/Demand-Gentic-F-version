# Multi-Provider AI Agent Orchestration Guide

## Overview

The **MultiProviderOrchestrator** intelligently routes AI/LLM requests to the optimal provider based on task type, cost, and performance metrics. Supports three enterprise-grade LLM providers:

- 🤖 **Copilot** (GitHub) - Fast, cost-effective code generation
- 🧠 **Claude** (Anthropic) - Extended reasoning, nuanced analysis, high-quality outputs
- 🔮 **Gemini** (Google Vertex AI) - Multimodal, cost-optimized, fastest inference

## Quick Start

### Installation & Setup

All dependencies are included. Configure API keys in `.env`:

```bash
# Required for all providers
GCP_PROJECT_ID=your-gcp-project
GCP_REGION=us-central1

# Provider keys
ANTHROPIC_API_KEY=sk-ant-...                    # Claude
GOOGLE_API_KEY=AIzaSy...                        # Gemini (if not using service account)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/creds   # For Vertex AI

# Optional: Cost optimization
OPTIMIZE_COSTS=false  # true = prioritize cost, false = prioritize quality (default)
```

## Usage

### Basic Usage via Helper Function

```typescript
import { aiAgentCall } from './server/services/multi-provider-agent';

// Simple request - returns string content only
const response = await aiAgentCall({
  prompt: "Generate a TypeScript async function that fetches user data",
  task: "code"
});

console.log(response);
// Output: "async function fetchUserData() { ... }"
```

### Advanced Usage via Orchestrator

```typescript
import { getOrchestrator } from './server/services/multi-provider-agent';

const orchestrator = getOrchestrator();

// Detailed request with all options
const response = await orchestrator.execute({
  prompt: "Analyze the following data for patterns",
  context: {
    data: [1, 2, 4, 8, 16],
    timeframe: "quarterly",
    industry: "fintech"
  },
  task: "analysis",
  maxTokens: 2048,
  temperature: 0.7
});

console.log(response);
// Output: {
//   provider: "claude",
//   content: "Your analysis response...",
//   tokensUsed: 1024,
//   costEstimate: 0.0342,
//   latencyMs: 1250
// }
```

### Integration in API Routes

```typescript
// routes/api/operations/analysis.ts
import { aiAgentCall } from '../services/multi-provider-agent';

export async function analyzeMetrics(req, res) {
  const { metrics, timeframe } = req.body;
  
  try {
    const analysis = await aiAgentCall({
      prompt: `Analyze these ${timeframe} metrics: ${JSON.stringify(metrics)}`,
      task: "analysis",
      maxTokens: 1024
    });
    
    res.json({ analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
```

## Task Types & Routing

The orchestrator intelligently selects the best provider based on task type:

### 1. **"code"** - Code Generation & Debugging
**Best For**: Function generation, bug fixes, code refactoring, syntax help

**Provider Selection**:
1. Primary: **Copilot** (fastest, Microsoft-trained on code)
2. Fallback: **Claude** (best reasoning if Copilot unavailable)

```typescript
// Generate deployment script
const result = await orchestrator.execute({
  prompt: "Write a GitHub Actions workflow for deploying to Cloud Run",
  task: "code",
  maxTokens: 3000
});
// Expected: Fast response (~200-500ms) with production-ready code
```

### 2. **"reasoning"** - Complex Analysis & Extended Thinking
**Best For**: Strategic planning, problem-solving, root cause analysis, hypothesis testing

**Provider Selection**:
1. Primary: **Claude** (extended thinking, best for nuanced reasoning)
2. Fallback: **Gemini** (vertex AI with extended thinking capability)

```typescript
// Complex root-cause analysis
const result = await orchestrator.execute({
  prompt: "Why are deployment failures increasing? Analyze root causes and suggest fixes.",
  task: "reasoning",
  context: { deploymentMetrics: [...], errorLogs: [...] }
});
// Expected: Detailed reasoning, step-by-step analysis (~2-5 seconds)
```

### 3. **"multimodal"** - Multi-Modal Content (Images, Audio, Video)
**Best For**: Image analysis, video summarization, document parsing

**Provider Selection**:
1. Primary: **Gemini** (best multimodal support)
2. Fallback: **Claude** (vision capabilities)

```typescript
// Analyze infrastructure diagram
const result = await orchestrator.execute({
  prompt: "Analyze this architecture diagram and identify bottlenecks",
  task: "multimodal",
  context: { imageUrl: "https://..." }
});
```

### 4. **"analysis"** - Data Analysis & Insights
**Best For**: Data aggregation, metric interpretation, trend analysis, financial analysis

**Provider Selection** (depends on `OPTIMIZE_COSTS` env var):
- **Quality-first** (`OPTIMIZE_COSTS=false`): Claude → Gemini
- **Cost-first** (`OPTIMIZE_COSTS=true`): Gemini → Claude

```typescript
// Cost analysis
await aiAgentCall({
  prompt: "Analyze our Q4 cloud spending",
  task: "analysis"
  // Uses Claude if quality-focused, Gemini if cost-focused
});
```

### 5. **"general"** - Open-ended Requests
**Best For**: Documentation, creative writing, customer support, general questions

**Provider Selection** (depends on `OPTIMIZE_COSTS`):
- **Quality-first**: Claude (best output quality)
- **Cost-first**: Gemini (cheapest at ~$0.000075/1000 tokens)

## Monitoring & Metrics

### View Orchestrator Status

```typescript
import { getOrchestrator } from './server/services/multi-provider-agent';

const orchestrator = getOrchestrator();
const status = orchestrator.getStatus();

console.log(status);
// Output: {
//   totalRequests: 245,
//   totalCostEstimate: 12.45,
//   averageLatency: 1234,
//   successRate: 0.989,
//   providers: {
//     copilot: {
//       requests: 120,
//       cost: 0,           // Usually free tier
//       successRate: 1.0,
//       availabilityStatus: "operational"
//     },
//     claude: {
//       requests: 89,
//       cost: 8.92,
//       successRate: 0.99,
//       availabilityStatus: "operational"
//     },
//     gemini: {
//       requests: 36,
//       cost: 3.53,
//       successRate: 0.97,
//       availabilityStatus: "operational"
//     }
//   }
// }
```

### List Available Providers

```typescript
const providers = orchestrator.listProviders();

console.log(providers);
// Output: [
//   {
//     name: "copilot",
//     available: true,
//     latencyMs: 245,
//     costPerRequest: 0,
//     successRate: 1.0
//   },
//   {
//     name: "claude",
//     available: true,
//     latencyMs: 1200,
//     costPerRequest: 0.00378,
//     successRate: 0.99
//   },
//   {
//     name: "gemini",
//     available: true,
//     latencyMs: 450,
//     costPerRequest: 0.00098,
//     successRate: 0.97
//   }
// ]
```

### Monitor via Operations Hub Dashboard

```
/ops-hub → Operations Hub Dashboard
  → [Logs Tab] → Filter: "agent" or "orchestrator"
  → [Costs Tab] → See AI provider costs
```

## API Reference

### AgentRequest Interface

```typescript
interface AgentRequest {
  // Required
  prompt: string;                           // The question/instruction
  
  // Optional
  context?: Record<string, any>;            // Additional context data
  task?: "code" | "analysis" | "reasoning" | "multimodal" | "general";
  maxTokens?: number;                       // Max response tokens (default: 2048)
  temperature?: number;                     // Randomness 0.0-1.0 (default: 0.7)
  systemPrompt?: string;                    // Custom system message (optional)
}
```

### AgentResponse Interface

```typescript
interface AgentResponse {
  provider: "copilot" | "claude" | "gemini";
  content: string;                          // The response text
  tokensUsed: number;                       // Tokens consumed
  costEstimate: number;                     // Estimated cost in USD
  latencyMs: number;                        // Response time in milliseconds
  metadata?: {
    model: string;                          // Specific model used
    finishReason: string;                   // Why response ended
    inputTokens: number;                    // Prompt tokens
    outputTokens: number;                   // Completion tokens
  }
}
```

## Cost Optimization

### Cost-Per-Request by Provider

| Provider | Cost per 1K Tokens | Best For | Speed |
|----------|------------------|----------|-------|
| **Copilot** | $0 (free tier) | Code generation | ⚡⚡⚡ Fastest |
| **Gemini** | $0.000075-0.00015 | Cost-sensitive tasks | ⚡⚡ Fast |
| **Claude** | $0.003-0.03 | High-quality analysis | ⏱️ Slower |

### Enable Cost Optimization Mode

```bash
# In .env
OPTIMIZE_COSTS=true
```

Routes to cheaper providers while maintaining quality:

```typescript
// With OPTIMIZE_COSTS=true
await aiAgentCall({
  prompt: "Describe this feature",
  task: "analysis"
  // Will route to Gemini instead of Claude (~30x cheaper)
});
```

### Monitor Monthly AI Costs

```typescript
// In your dashboard or cron job
const status = orchestrator.getStatus();
const estimatedMonthly = status.totalCostEstimate * (30 / daysRunning);

console.log(`Estimated monthly cost: $${estimatedMonthly.toFixed(2)}`);
```

## Error Handling

### Graceful Fallbacks

The orchestrator automatically falls back if a provider fails:

```typescript
try {
  // Tries Copilot first, falls back to Claude if unavailable
  const result = await orchestrator.execute({
    prompt: "Generate code",
    task: "code"
  });
} catch (err) {
  // If all providers fail, this error is thrown
  console.error('All providers unavailable:', err);
  // Fallback to cached response or queue for retry
}
```

### Retry Logic

```typescript
async function callWithRetry(request, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await orchestrator.execute(request);
    } catch (err) {
      lastError = err;
      console.warn(`Attempt ${attempt} failed:`, err.message);
      await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
    }
  }
  
  throw lastError;
}
```

## Configuration Examples

### Production Setup

```typescript
// Server startup configuration
process.env.GCP_PROJECT_ID = 'production-project';
process.env.OPTIMIZE_COSTS = 'false';  // Prioritize quality
process.env.NODE_ENV = 'production';

// Get orchestrator with production settings
const orchestrator = getOrchestrator();
console.log('Orchestrator initialized:', orchestrator.listProviders());
```

### Development Setup

```typescript
// Development configuration
process.env.OPTIMIZE_COSTS = 'true';   // Save costs during dev
process.env.NODE_ENV = 'development';

// Use Copilot primarily (fast feedback)
const response = await aiAgentCall({
  prompt: "Fix this code snippet",
  task: "code"
  // Will quickly route to Copilot
});
```

### Testing Setup

```typescript
// Mock orchestrator for tests
jest.mock('./server/services/multi-provider-agent', () => ({
  aiAgentCall: jest.fn(async (request) => {
    return `Mock response for: ${request.prompt}`;
  })
}));
```

## Advanced Features

### Custom Provider Implementation

To add a new provider, extend the orchestrator:

```typescript
import { getOrchestrator } from './server/services/multi-provider-agent';

const orchestrator = getOrchestrator();

// Add custom provider (not yet implemented in core, but structure is extensible)
// orchestrator.registerProvider('custom', customProviderClass);
```

### Request History & Analytics

```typescript
const orchestrator = getOrchestrator();

// Access request history for analytics
const history = orchestrator.getRequestHistory();

// Analyze patterns
const codeRequests = history.filter(r => r.request.task === 'code');
const avgCost = codeRequests.reduce((sum, r) => sum + r.costEstimate, 0) / codeRequests.length;

console.log(`Average code generation cost: $${avgCost.toFixed(4)}`);
```

### Dynamic Task Selection

```typescript
// Automatically select task type based on prompt content
function selectTaskType(prompt: string): string {
  if (prompt.includes('code') || prompt.includes('function')) return 'code';
  if (prompt.includes('analysis') || prompt.includes('analyze')) return 'analysis';
  if (prompt.includes('reason') || prompt.includes('why')) return 'reasoning';
  if (prompt.includes('image') || prompt.includes('video')) return 'multimodal';
  return 'general';
}

const response = await orchestrator.execute({
  prompt: userPrompt,
  task: selectTaskType(userPrompt)
});
```

## Troubleshooting

### Issue: "Provider unavailable" error

**Solution**: Check API keys and authentication:
```bash
# Verify API keys are set
echo $ANTHROPIC_API_KEY
echo $GOOGLE_API_KEY

# Test GCP authentication
gcloud auth application-default login
gcloud config set project $GCP_PROJECT_ID
```

### Issue: Slow response times

**Solution**: Monitor latency and check provider health:
```typescript
const providers = orchestrator.listProviders();
const slowProviders = providers.filter(p => p.latencyMs > 2000);
console.log('Slow providers:', slowProviders);
```

### Issue: High costs

**Solution**: Enable cost optimization:
```bash
OPTIMIZE_COSTS=true npm run dev
```

Monitor spending:
```typescript
const status = orchestrator.getStatus();
console.log(`Total spend: $${status.totalCostEstimate}`);
```

## Integration Examples

### Express Route Handler

```typescript
// routes/api/agents/chat.ts
import { aiAgentCall } from '../services/multi-provider-agent';

export async function chat(req, res) {
  const { message, context, taskType } = req.body;
  
  try {
    const response = await aiAgentCall({
      prompt: message,
      context,
      task: taskType || 'general'
    });
    
    res.json({ response });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
```

### WebSocket Real-Time Agent

```typescript
// Integrate with Operations Hub WebSocket
import { setupOpsWebSocket } from './middleware/ops-websocket';
import { getOrchestrator } from './services/multi-provider-agent';

function setupAgentSocket(io) {
  const orchestrator = getOrchestrator();
  
  io.on('connection', (socket) => {
    socket.on('agent-request', async (request) => {
      socket.emit('agent-status', { status: 'processing' });
      
      try {
        const response = await orchestrator.execute(request);
        socket.emit('agent-response', response);
      } catch (err) {
        socket.emit('agent-error', { error: err.message });
      }
    });
  });
}
```

### Scheduled Analysis

```typescript
// Run daily analysis using orchestrator
import cron from 'node-cron';
import { aiAgentCall } from './services/multi-provider-agent';

// Every day at 9 AM
cron.schedule('0 9 * * *', async () => {
  const metrics = await getYesterdayMetrics();
  
  const analysis = await aiAgentCall({
    prompt: `Analyze yesterday's metrics: ${JSON.stringify(metrics)}`,
    task: 'analysis'
  });
  
  console.log('Daily Analysis:', analysis);
  // Store & notify team
});
```

---

**Next Steps**:
- Review [Operations Hub Setup Guide](./OPS_INFRASTRUCTURE_SETUP.md)
- Check [Cloud Workstations Setup](./CLOUD_WORKSTATIONS_SETUP.md)
- Review [Project Manager CLI Guide](./PROJECT_MANAGER_GUIDE.md)
