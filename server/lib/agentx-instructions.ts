/**
 * AgentX Instruction Documents
 * 
 * Centralized instruction system for the AgentX coding and CRM agent.
 * These instructions are loaded at runtime and injected into AgentX's
 * system prompt alongside the core identity from org-intelligence-helper.ts
 * and role-based prompts from the agentPrompts DB table.
 * 
 * Architecture:
 *   org-intelligence-helper.ts  → Core identity (problem-solver, warmth, authenticity)
 *   agentPrompts (DB)           → Role-specific capabilities & restrictions
 *   THIS FILE                   → Operational instructions (coding, UI, security, models)
 */

// ─── Model Provider Catalog ──────────────────────────────────────────────

export interface ModelVersion {
  id: string;
  name: string;
  contextWindow: string;
  costTier: 'low' | 'medium' | 'high';
  strengths: string[];
}

export interface ModelProvider {
  provider: string;
  models: ModelVersion[];
}

export const MODEL_CATALOG: ModelProvider[] = [
  {
    provider: 'Moonshot (Kimi)',
    models: [
      {
        id: 'moonshot-v1-auto',
        name: 'Kimi Code Latest',
        contextWindow: '128k',
        costTier: 'medium',
        strengths: ['creative coding', 'deep research', 'long-context analysis'],
      },
      {
        id: 'moonshot-v1-8k',
        name: 'Kimi Fast',
        contextWindow: '8k',
        costTier: 'low',
        strengths: ['quick edits', 'chat', 'fast responses'],
      },
      {
        id: 'moonshot-v1-32k',
        name: 'Kimi Standard',
        contextWindow: '32k',
        costTier: 'medium',
        strengths: ['balanced quality/speed', 'general coding'],
      },
    ],
  },
  {
    provider: 'Anthropic (Claude)',
    models: [
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        contextWindow: '200k',
        costTier: 'high',
        strengths: ['complex architecture', 'multi-file refactors', 'deep reasoning'],
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        contextWindow: '200k',
        costTier: 'medium',
        strengths: ['balanced coding', 'code review', 'daily development'],
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        contextWindow: '200k',
        costTier: 'medium',
        strengths: ['fast coding', 'reliable', 'well-tested'],
      },
    ],
  },
  {
    provider: 'Google (Gemini)',
    models: [
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        contextWindow: '1M',
        costTier: 'medium',
        strengths: ['massive context', 'documentation', 'code analysis'],
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        contextWindow: '1M',
        costTier: 'low',
        strengths: ['fast completions', 'linting', 'quick analysis'],
      },
      {
        id: 'gemini-2.5-flash-preview-native-audio-dialog',
        name: 'Gemini 2.5 Flash Live (Audio)',
        contextWindow: '1M',
        costTier: 'low',
        strengths: ['real-time audio', 'voice agents', 'streaming'],
      },
    ],
  },
  {
    provider: 'OpenAI (GPT)',
    models: [
      {
        id: 'gpt-4.1',
        name: 'GPT-4.1',
        contextWindow: '1M',
        costTier: 'high',
        strengths: ['complex reasoning', 'code generation', 'instruction following'],
      },
      {
        id: 'gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        contextWindow: '1M',
        costTier: 'low',
        strengths: ['fast edits', 'simple tasks', 'cost-efficient'],
      },
      {
        id: 'o4-mini',
        name: 'o4-mini',
        contextWindow: '200k',
        costTier: 'medium',
        strengths: ['reasoning-heavy tasks', 'planning', 'analysis'],
      },
    ],
  },
  {
    provider: 'DeepSeek',
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek V3',
        contextWindow: '128k',
        costTier: 'low',
        strengths: ['cost-efficient coding', 'reasoning', 'Chinese/English bilingual'],
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek R1',
        contextWindow: '128k',
        costTier: 'low',
        strengths: ['chain-of-thought reasoning', 'math', 'logic'],
      },
      {
        id: 'deepseek-coder',
        name: 'DeepSeek Coder V2',
        contextWindow: '128k',
        costTier: 'low',
        strengths: ['code generation', 'completion', 'fill-in-the-middle'],
      },
    ],
  },
];

// ─── Model Selection Strategy ────────────────────────────────────────────

export type TaskType =
  | 'creative_design'
  | 'complex_architecture'
  | 'daily_coding'
  | 'quick_edits'
  | 'code_review'
  | 'deep_research'
  | 'security_audit'
  | 'documentation'
  | 'voice_realtime';

export const MODEL_SELECTION_STRATEGY: Record<TaskType, { primary: string; fallback: string }> = {
  creative_design:      { primary: 'moonshot-v1-auto',           fallback: 'claude-opus-4-20250514' },
  complex_architecture: { primary: 'moonshot-v1-auto',           fallback: 'claude-opus-4-20250514' },
  daily_coding:         { primary: 'moonshot-v1-32k',            fallback: 'claude-sonnet-4-20250514' },
  quick_edits:          { primary: 'moonshot-v1-8k',             fallback: 'gemini-2.5-flash' },
  code_review:          { primary: 'claude-sonnet-4-20250514',   fallback: 'gemini-2.5-flash' },
  deep_research:        { primary: 'moonshot-v1-auto',           fallback: 'gemini-2.5-pro' },
  security_audit:       { primary: 'claude-opus-4-20250514',     fallback: 'gpt-4.1' },
  documentation:        { primary: 'gemini-2.5-pro',             fallback: 'claude-sonnet-4-20250514' },
  voice_realtime:       { primary: 'gemini-2.5-flash-preview-native-audio-dialog', fallback: 'gemini-2.5-flash' },
};

// ─── AgentX Operating Instructions ───────────────────────────────────────

export const AGENTX_CODING_INSTRUCTIONS = `
## AgentX Coding Standards

### Architecture Rules
- Schema changes start in shared/schema.ts (Drizzle ORM), then propagate to server routes/services, then client
- Keep server/routes/* thin — business logic goes in server/services/*
- Reuse existing UI components from client/src/components/ui/*
- Use authenticated request helpers from client/src/lib/queryClient.ts

### Code Quality
- TypeScript strict mode — no \`any\` types without justification
- Validate all external input with Zod schemas at API boundaries
- Use Drizzle ORM parameterized queries — never concatenate SQL strings
- Consistent error responses: { success: boolean, data?: T, error?: string }
- Select only needed columns in database queries
- Use proper pagination with .limit() and .offset()

### Cost Efficiency
- Batch database operations instead of loops
- Cache expensive computations in Redis with TTL
- Tree-shakeable imports (named imports, not barrel imports)
- Lazy load route-level components
- Minimize external API calls (LLM, Telnyx, Google)
- Use the worker pool for background tasks, API pool for requests
`;

export const AGENTX_SECURITY_INSTRUCTIONS = `
## AgentX Security Standards (OWASP Top 10)

### Authentication & Authorization
- Admin routes: verify authToken via middleware
- Client portal routes: verify clientPortalToken
- Never expose internal error details in API responses
- Validate webhook signatures before processing (Telnyx, Stripe)

### Input Validation
- Validate ALL request bodies with Zod schemas
- Sanitize user input before database insertion
- Use parameterized queries (Drizzle handles this)
- Validate URL parameters and query strings

### Data Protection
- Never log sensitive data (tokens, passwords, PII)
- Environment variables via server/env.ts only
- Never expose secrets to client bundles
- STRICT_ENV_ISOLATION=true in development
- Proper CORS origins — never use * in production

### Infrastructure
- Rate limiting on sensitive endpoints
- CSRF protection on state-changing operations
- Security headers (Content-Security-Policy, X-Frame-Options)
- Audit trail for destructive operations
`;

export const AGENTX_UI_INSTRUCTIONS = `
## AgentX UI Design Standards  

### VS Code-Inspired Interface
Every interface should feel like a professional development tool:
- Activity Bar (left) — icon-based navigation with tooltips
- Side Panel — collapsible tree views, search, filters
- Editor Area — tabbed content with split-view support
- Panel (bottom) — terminal output, logs, problems panel
- Status Bar — context information, notifications

### Component Patterns
- Use Tailwind CSS with existing theme tokens (bg-background, text-foreground, border-border)
- Radix UI primitives from client/src/components/ui/*
- Lucide React for icons
- cn() from utils for conditional class merging
- Responsive-first: mobile → tablet → desktop

### Micro-Interactions
- Hover states: hover:bg-accent hover:text-accent-foreground
- Focus management: focus-visible:ring-2 focus-visible:ring-ring
- Loading: skeleton components, never blank screens
- Toasts for user feedback
- Smooth transitions: transition-colors duration-150

### Accessibility (WCAG 2.1 AA)
- aria-label on all interactive elements
- Keyboard navigation with proper focus management
- Color contrast ratio ≥ 4.5:1
- Screen reader announcements for dynamic content

### Creativity Priority
- Never use generic templates — every component should feel purposeful
- Push for distinctive, memorable UI/UX
- Subtle animations that enhance comprehension
- Smart defaults that reduce cognitive load
`;

// ─── Instruction Loader ──────────────────────────────────────────────────

export type InstructionScope = 'coding' | 'security' | 'ui' | 'all';

/**
 * Get AgentX operating instructions by scope.
 * These supplement the core identity (org-intelligence-helper) and role prompts (DB).
 */
export function getAgentXInstructions(scope: InstructionScope = 'all'): string {
  switch (scope) {
    case 'coding':
      return AGENTX_CODING_INSTRUCTIONS;
    case 'security':
      return AGENTX_SECURITY_INSTRUCTIONS;
    case 'ui':
      return AGENTX_UI_INSTRUCTIONS;
    case 'all':
      return [
        AGENTX_CODING_INSTRUCTIONS,
        AGENTX_SECURITY_INSTRUCTIONS,
        AGENTX_UI_INSTRUCTIONS,
      ].join('\n');
  }
}

/**
 * Get the model selection recommendation for a given task type.
 */
export function getRecommendedModel(taskType: TaskType): { primary: string; fallback: string; catalog: ModelVersion[] } {
  const strategy = MODEL_SELECTION_STRATEGY[taskType];
  const allModels = MODEL_CATALOG.flatMap(p => p.models);
  const primary = allModels.find(m => m.id === strategy.primary);
  const fallback = allModels.find(m => m.id === strategy.fallback);

  return {
    primary: strategy.primary,
    fallback: strategy.fallback,
    catalog: [primary, fallback].filter(Boolean) as ModelVersion[],
  };
}

/**
 * Get the full model catalog for display in UI or agent selection.
 */
export function getModelCatalog(): ModelProvider[] {
  return MODEL_CATALOG;
}

/**
 * Build the complete AgentX instruction prompt for injection into the system prompt.
 * Determines scope based on the user's intent.
 */
export function buildAgentXInstructionPrompt(userMessage: string): string {
  const msgLower = userMessage.toLowerCase();

  // Determine which instructions are relevant
  const scopes: InstructionScope[] = [];

  if (/\b(code|debug|refactor|implement|function|class|api|endpoint|fix|build|create|write)\b/.test(msgLower)) {
    scopes.push('coding');
  }
  if (/\b(security|auth|token|password|vulnerability|injection|xss|csrf|owasp|encrypt)\b/.test(msgLower)) {
    scopes.push('security');
  }
  if (/\b(ui|design|component|layout|page|style|css|tailwind|button|form|modal|panel|tab)\b/.test(msgLower)) {
    scopes.push('ui');
  }

  // Default: include coding instructions at minimum
  if (scopes.length === 0) {
    scopes.push('coding');
  }

  const instructions = scopes.map(s => getAgentXInstructions(s)).join('\n');

  return `\n## AgentX Operating Instructions\n${instructions}`;
}
