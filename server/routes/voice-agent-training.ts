import { Router, Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireRole } from '../auth';
import { initializeUnifiedAgentArchitecture, unifiedAgentRegistry } from '../services/agents/unified';
import { simulationEngine, DEFAULT_PERSONAS, type SimulatedHumanProfile } from '../services/simulation-engine';
import { aiVoiceEnum } from '@shared/schema';

const router = Router();

const STORE_FILE = path.resolve(process.cwd(), '.local', 'voice-agent-training-drafts.json');

type DraftSection = {
  sectionId: string;
  name: string;
  category: string;
  content: string;
  lastEditedAt: string;
  lastEditedBy: string | null;
};

type DraftSnapshot = {
  version: number;
  savedAt: string;
  editor: string | null;
  summary: string;
  basedOnPublishedVersion: string | null;
  sections: Record<string, DraftSection>;
};

type PublishRecord = {
  publishedVersion: string;
  publishedAt: string;
  publishedBy: string | null;
  note: string;
  sectionChanges: number;
};

type SectionChange = {
  sectionId: string;
  name: string;
  oldContent: string;
  newContent: string;
};

type PendingPublishRequest = {
  id: string;
  requestedBy: string;
  requestedAt: string;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  draftVersion: number;
  sectionChanges: SectionChange[];
};

type LiveTestTranscriptTurn = {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
};

type LiveTestScores = {
  overall: number;
  toneAdherence: number;
  objectionHandling: number;
  identityLock: number;
  callFlow: number;
};

type LiveTestRecord = {
  id: string;
  startedAt: string;
  endedAt: string;
  userId: string;
  voiceId: string;
  draftVersion: number;
  transcript: LiveTestTranscriptTurn[];
  durationSec: number;
  scores: LiveTestScores;
  evaluation: {
    recommendations: string[];
    conversationStages: string[];
  };
};

type SimulationRecord = {
  id: string;
  runAt: string;
  runBy: string;
  scenarioId: string;
  scenarioTitle: string;
  personaId: string;
  turns: number;
  transcript: { role: string; content: string }[];
  scores: { overall: number; toneAdherence: number; objectionHandling: number; identityLock: number; callFlow: number };
  evaluation: { recommendations: string[]; conversationStages: string[] };
};

type ActivityLogEntry = {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  detail: string;
  category: 'edit' | 'simulation' | 'publish' | 'approval' | 'config' | 'scenario' | 'snippet' | 'comment';
};

type SectionComment = {
  id: string;
  sectionId: string;
  userId: string;
  createdAt: string;
  content: string;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
};

type PromptSnippet = {
  id: string;
  title: string;
  content: string;
  category: string;
  createdBy: string;
  createdAt: string;
  isApproved: boolean;
};

type CustomScenario = {
  id: string;
  title: string;
  description: string;
  defaultPersonaId: string;
  defaultObjections: string[];
  createdBy: string;
  createdAt: string;
  isApproved: boolean;
};

type VoiceTrainingStore = {
  publishedVersion: string | null;
  publishedPromptHash: string | null;
  draftVersion: number;
  createdAt: string;
  updatedAt: string;
  lastEditor: string | null;
  sections: Record<string, DraftSection>;
  history: DraftSnapshot[];
  publishHistory: PublishRecord[];
  pendingPublishRequests: PendingPublishRequest[];
  voiceConfig: {
    provider: string;
    voiceId: string;
    speakingRate: number;
    tone: string;
    clarity: number;
  };
  liveTestHistory?: LiveTestRecord[];
  simulationHistory?: SimulationRecord[];
  activityLog?: ActivityLogEntry[];
  sectionComments?: Record<string, SectionComment[]>;
  snippets?: PromptSnippet[];
  customScenarios?: CustomScenario[];
};

const scenarioPresets = [
  {
    id: 'gatekeeper_handoff',
    title: 'Gatekeeper Handoff',
    description: 'Receptionist blocks access and asks for call reason.',
    defaultPersonaId: 'gatekeeper_assistant',
    defaultObjections: ['What is this regarding?', 'Can I take a message?'],
  },
  {
    id: 'budget_objection',
    title: 'Budget Objection',
    description: 'Decision maker pushes back due to budget timing.',
    defaultPersonaId: 'skeptical_cfo',
    defaultObjections: ['We have no budget right now.', 'We already have a vendor.'],
  },
  {
    id: 'voicemail_path',
    title: 'Voicemail Path',
    description: 'Prospect route goes directly to voicemail behavior.',
    defaultPersonaId: 'neutral_dm',
    defaultObjections: ['Please leave a message after the tone.'],
  },
  {
    id: 'identity_lock_test',
    title: 'Identity Lock Test',
    description: 'Prospect repeatedly asks who is calling before identity confirmation.',
    defaultPersonaId: 'deflective_gatekeeper',
    defaultObjections: ['Who is this?', 'What is this about?'],
  },
  {
    id: 'hard_refusal',
    title: 'Hard Refusal / DNC',
    description: 'Prospect requests removal immediately.',
    defaultPersonaId: 'hostile_dm',
    defaultObjections: ['Remove me from your list.', 'Do not call me again.'],
  },
];

const sampleDataset = {
  campaigns: [
    { id: 'demo-camp-1', name: 'SaaS Security Webinar Follow-Up', industry: 'Cybersecurity', buyerPersona: 'CISO', objectionPattern: 'budget' },
    { id: 'demo-camp-2', name: 'Healthcare Analytics Executive Briefing', industry: 'Healthcare', buyerPersona: 'VP Operations', objectionPattern: 'timing' },
    { id: 'demo-camp-3', name: 'FinServ Compliance Automation', industry: 'Financial Services', buyerPersona: 'Head of Compliance', objectionPattern: 'risk' },
    { id: 'demo-camp-4', name: 'Manufacturing AI Quality Control', industry: 'Manufacturing', buyerPersona: 'COO', objectionPattern: 'integration' },
    { id: 'demo-camp-5', name: 'Retail Demand Forecasting Suite', industry: 'Retail', buyerPersona: 'VP Supply Chain', objectionPattern: 'status_quo' },
  ],
  accounts: [
    { id: 'demo-acct-1', name: 'Northline Health Group', industry: 'Healthcare' },
    { id: 'demo-acct-2', name: 'ApexLedger Financial', industry: 'Financial Services' },
    { id: 'demo-acct-3', name: 'ForgeWorks Manufacturing', industry: 'Manufacturing' },
    { id: 'demo-acct-4', name: 'BlueCart Retail Systems', industry: 'Retail' },
    { id: 'demo-acct-5', name: 'SecureSphere Cloud', industry: 'Cybersecurity' },
    { id: 'demo-acct-6', name: 'TransitEdge Logistics', industry: 'Logistics' },
  ],
  contacts: [
    { id: 'demo-contact-1', name: 'Ava Morgan', title: 'CISO', accountId: 'demo-acct-5', objection: 'We have no budget this quarter.' },
    { id: 'demo-contact-2', name: 'Noah Patel', title: 'VP Operations', accountId: 'demo-acct-1', objection: 'Can you email me details?' },
    { id: 'demo-contact-3', name: 'Liam Chen', title: 'Head of Compliance', accountId: 'demo-acct-2', objection: 'We need legal review first.' },
    { id: 'demo-contact-4', name: 'Mia Santos', title: 'COO', accountId: 'demo-acct-3', objection: 'Integration sounds complex.' },
    { id: 'demo-contact-5', name: 'Ethan Brooks', title: 'VP Supply Chain', accountId: 'demo-acct-4', objection: 'We already use another platform.' },
    { id: 'demo-contact-6', name: 'Grace Kim', title: 'Director IT', accountId: 'demo-acct-6', objection: 'Who exactly are you with?' },
    { id: 'demo-contact-7', name: 'Oliver Reyes', title: 'Procurement Lead', accountId: 'demo-acct-3', objection: 'Please call next month.' },
    { id: 'demo-contact-8', name: 'Sophia Ward', title: 'Chief Data Officer', accountId: 'demo-acct-1', objection: 'Send a one-page summary first.' },
    { id: 'demo-contact-9', name: 'Lucas Diaz', title: 'Finance Director', accountId: 'demo-acct-2', objection: 'No immediate priority right now.' },
    { id: 'demo-contact-10', name: 'Isabella Hunt', title: 'VP Sales Enablement', accountId: 'demo-acct-4', objection: 'Can you prove ROI quickly?' },
    { id: 'demo-contact-11', name: 'James Park', title: 'Security Architect', accountId: 'demo-acct-5', objection: 'Is this compliant with our policy?' },
    { id: 'demo-contact-12', name: 'Charlotte Liu', title: 'Operations Manager', accountId: 'demo-acct-6', objection: 'I am not the decision maker.' },
  ],
};

function getUserId(req: Request): string {
  return ((req as any).user?.id || (req as any).user?.userId || 'dev-user') as string;
}

function getUserRoles(req: Request): string[] {
  const u = (req as any).user;
  if (Array.isArray(u?.roles) && u.roles.length > 0) return u.roles;
  if (u?.role) return [u.role];
  return [];
}

function isVoiceTrainerOnly(req: Request): boolean {
  const roles = getUserRoles(req);
  return roles.includes('voice_trainer') && !roles.includes('admin');
}

async function ensureStore(agentVersion: string, promptHash: string | null): Promise<VoiceTrainingStore> {
  try {
    const existing = JSON.parse(await fs.readFile(STORE_FILE, 'utf8')) as VoiceTrainingStore;
    if (!existing.sections || Object.keys(existing.sections).length === 0) {
      throw new Error('Invalid store sections');
    }
    return existing;
  } catch {
    const agent = unifiedAgentRegistry.getAgent('voice');
    const now = new Date().toISOString();
    const sections: Record<string, DraftSection> = {};

    for (const section of agent?.promptSections || []) {
      sections[section.id] = {
        sectionId: section.id,
        name: section.name,
        category: section.category,
        content: section.content,
        lastEditedAt: now,
        lastEditedBy: 'system',
      };
    }

    const initial: VoiceTrainingStore = {
      publishedVersion: agentVersion,
      publishedPromptHash: promptHash,
      draftVersion: 1,
      createdAt: now,
      updatedAt: now,
      lastEditor: 'system',
      sections,
      history: [],
      publishHistory: [],
      pendingPublishRequests: [],
      voiceConfig: {
        provider: 'gemini_live',
        voiceId: (aiVoiceEnum as any).enumValues?.[0] || 'Fenrir',
        speakingRate: 1,
        tone: 'professional',
        clarity: 1,
      },
    };

    await persistStore(initial);
    return initial;
  }
}

function ensureStoreDefaults(store: VoiceTrainingStore): void {
  if (!store.liveTestHistory) store.liveTestHistory = [];
  if (!store.simulationHistory) store.simulationHistory = [];
  if (!store.activityLog) store.activityLog = [];
  if (!store.sectionComments) store.sectionComments = {};
  if (!store.snippets) store.snippets = [];
  if (!store.customScenarios) store.customScenarios = [];
}

function addActivityEntry(store: VoiceTrainingStore, userId: string, action: string, detail: string, category: ActivityLogEntry['category']): void {
  ensureStoreDefaults(store);
  store.activityLog!.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    userId,
    action,
    detail,
    category,
  });
  if (store.activityLog!.length > 500) {
    store.activityLog = store.activityLog!.slice(0, 500);
  }
}

function computeLineDiff(oldText: string, newText: string): { type: 'same' | 'add' | 'remove'; line: string }[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: { type: 'same' | 'add' | 'remove'; line: string }[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: 'same', line: oldLines[oi] });
      oi++; ni++;
    } else if (ni < newLines.length && (oi >= oldLines.length || newLines[ni] !== oldLines[oi])) {
      result.push({ type: 'add', line: newLines[ni] });
      ni++;
    } else {
      result.push({ type: 'remove', line: oldLines[oi] });
      oi++;
    }
  }
  return result;
}

async function persistStore(store: VoiceTrainingStore): Promise<void> {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function getVoiceAgentOrThrow() {
  let agent = unifiedAgentRegistry.getAgent('voice');

  // Self-heal if unified architecture was not initialized yet in this process.
  if (!agent) {
    try {
      initializeUnifiedAgentArchitecture();
      agent = unifiedAgentRegistry.getAgent('voice');
    } catch {
      // Fall through to standard error below
    }
  }

  if (!agent) {
    throw new Error('Unified voice agent is not initialized');
  }
  return agent;
}

router.use(requireRole('admin', 'manager', 'campaign_manager', 'quality_analyst', 'qa_analyst', 'data_ops', 'voice_trainer'));

router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);

    // Compute stats
    const simHist = store.simulationHistory || [];
    const avgSimScore = simHist.length ? Math.round(simHist.reduce((sum, r) => sum + r.scores.overall, 0) / simHist.length) : 0;
    const modifiedSections = Object.values(store.sections).filter(ds => {
      const prod = agent.promptSections.find(p => p.id === ds.sectionId);
      return prod && prod.content !== ds.content;
    }).length;
    const pendingApprovals = (store.pendingPublishRequests || []).filter(r => r.status === 'pending').length;
    const totalComments = Object.values(store.sectionComments || {}).reduce((sum, arr) => sum + arr.filter(c => !c.resolved).length, 0);
    const lastActivity = store.activityLog?.length ? store.activityLog[0].timestamp : null;

    res.json({
      environment: 'development_preview',
      production: {
        version: agent.versionControl.currentVersion,
        promptHash: agent.promptVersion,
        sectionCount: agent.promptSections.length,
      },
      preview: {
        draftVersion: store.draftVersion,
        sectionCount: Object.keys(store.sections).length,
        lastUpdatedAt: store.updatedAt,
      },
      governance: {
        schemaCentralized: true,
        architectureParity: true,
        driftProtection: store.publishedVersion === agent.versionControl.currentVersion,
      },
      stats: {
        totalSimulations: simHist.length,
        avgSimScore,
        modifiedSections,
        pendingApprovals,
        totalComments,
        lastActivity,
        snippetCount: (store.snippets || []).length,
        customScenarioCount: (store.customScenarios || []).length,
      },
      supportedModules: [
        'foundation_prompt',
        'voice_identity',
        'gatekeeper_protocol',
        'objection_handling',
        'conversation_state_machine',
        'special_conditions_logic',
        'tone_rules',
        'ai_transparency_rules',
        'allowed_variables',
      ],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch training overview' });
  }
});

router.get('/draft', async (_req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);

    res.json({
      draftVersion: store.draftVersion,
      basedOnPublishedVersion: store.publishedVersion,
      sections: Object.values(store.sections).sort((a, b) => a.name.localeCompare(b.name)),
      voiceConfig: store.voiceConfig,
      updatedAt: store.updatedAt,
      updatedBy: store.lastEditor,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch draft' });
  }
});

const updateSectionSchema = z.object({
  content: z.string().min(1),
  changeLog: z.string().min(3),
});

router.put('/draft/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const parsed = updateSectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid section update payload', details: parsed.error.format() });
    }

    const agent = getVoiceAgentOrThrow();
    const section = agent.promptSections.find((s) => s.id === req.params.sectionId);
    if (!section) {
      return res.status(404).json({ error: `Section not found: ${req.params.sectionId}` });
    }

    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    const editor = getUserId(req);

    const existing = store.sections[section.id] || {
      sectionId: section.id,
      name: section.name,
      category: section.category,
      content: section.content,
      lastEditedAt: new Date().toISOString(),
      lastEditedBy: editor,
    };

    store.sections[section.id] = {
      ...existing,
      content: parsed.data.content,
      lastEditedAt: new Date().toISOString(),
      lastEditedBy: editor,
    };

    store.history.push({
      version: store.draftVersion,
      savedAt: new Date().toISOString(),
      editor,
      summary: parsed.data.changeLog,
      basedOnPublishedVersion: store.publishedVersion,
      sections: JSON.parse(JSON.stringify(store.sections)),
    });

    store.draftVersion += 1;
    store.updatedAt = new Date().toISOString();
    store.lastEditor = editor;
    addActivityEntry(store, editor, 'Edited section', `Edited section: ${section.name} — ${parsed.data.changeLog}`, 'edit');

    await persistStore(store);

    res.json({
      success: true,
      draftVersion: store.draftVersion,
      section: store.sections[section.id],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update draft section' });
  }
});

const voiceConfigSchema = z.object({
  provider: z.string().min(1),
  voiceId: z.string().min(1),
  speakingRate: z.number().min(0.5).max(2),
  tone: z.string().min(1),
  clarity: z.number().min(0.5).max(2),
});

router.put('/voice-config', async (req: Request, res: Response) => {
  try {
    const parsed = voiceConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid voice config payload', details: parsed.error.format() });
    }

    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    store.voiceConfig = parsed.data;
    store.updatedAt = new Date().toISOString();
    store.lastEditor = getUserId(req);
    addActivityEntry(store, getUserId(req), 'Updated voice config', `Voice: ${parsed.data.voiceId}, Rate: ${parsed.data.speakingRate}`, 'config');
    await persistStore(store);

    res.json({ success: true, voiceConfig: store.voiceConfig });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update voice config' });
  }
});

router.get('/voices', (_req: Request, res: Response) => {
  const voices = ((aiVoiceEnum as any).enumValues || []).map((voice: string) => ({ id: voice, label: voice }));
  res.json({
    provider: 'gemini_live',
    voices,
    tuningParameters: ['speakingRate', 'tone', 'clarity'],
  });
});

router.get('/sample-dataset', (_req: Request, res: Response) => {
  res.json(sampleDataset);
});

router.get('/simulation-options', async (req: Request, res: Response) => {
  try {
    const personas = Object.entries(DEFAULT_PERSONAS).map(([id, profile]) => ({
      id,
      name: id.replace(/_/g, ' '),
      ...profile,
    }));

    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);
    const userId = getUserId(req);
    const customScenarios = (store.customScenarios || []).filter(
      s => s.isApproved || s.createdBy === userId || !isVoiceTrainerOnly(req)
    );

    res.json({
      scenarios: scenarioPresets,
      personas,
      customScenarios,
    });
  } catch (error: any) {
    res.json({ scenarios: scenarioPresets, personas: [], customScenarios: [] });
  }
});

const simulateSchema = z.object({
  campaignId: z.string().optional().nullable(),
  accountId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  virtualAgentId: z.string().optional().nullable(),
  scenarioId: z.string().optional(),
  personaId: z.string().optional(),
  maxTurns: z.number().min(2).max(30).default(16),
  inputScenario: z.string().optional(),
});

router.post('/simulate', async (req: Request, res: Response) => {
  try {
    const parsed = simulateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid simulation payload', details: parsed.error.format() });
    }

    const data = parsed.data;
    const preset = scenarioPresets.find((s) => s.id === data.scenarioId);
    const persona = (data.personaId && DEFAULT_PERSONAS[data.personaId])
      || (preset?.defaultPersonaId && DEFAULT_PERSONAS[preset.defaultPersonaId])
      || DEFAULT_PERSONAS.neutral_dm;

    const humanProfile: SimulatedHumanProfile = {
      ...persona,
      objections: preset?.defaultObjections || persona.objections || [],
    };

    // ── Assemble the trainer's current draft prompt so the simulation uses it ──
    let draftSystemPrompt: string | undefined;
    let draftVersion: number | null = null;
    let draftSectionCount = 0;
    try {
      const agent = getVoiceAgentOrThrow();
      const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
      draftVersion = store.draftVersion;
      const draftSections = Object.values(store.sections);
      if (draftSections.length > 0) {
        draftSectionCount = draftSections.length;
        // Sort by category then name for deterministic ordering
        draftSections.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
        draftSystemPrompt = draftSections
          .map((s) => `## ${s.name}\n${s.content}`)
          .join('\n\n');
      }
    } catch {
      // Non-blocking — simulation will fall through to default prompt
    }

    const session = await simulationEngine.createSession({
      campaignId: data.campaignId,
      accountId: data.accountId,
      contactId: data.contactId,
      virtualAgentId: data.virtualAgentId,
      userId: getUserId(req),
      humanProfile,
      maxTurns: data.maxTurns,
      simulationSpeed: 'fast',
      customFirstMessage: data.inputScenario,
      customSystemPrompt: draftSystemPrompt,
    });

    const completed = await simulationEngine.runFullSimulation(session);
    const fullTranscript = completed.transcript.map((t) => ({ role: t.role, content: t.content }));
    const transcriptPreview = fullTranscript.slice(0, 12);

    // Build scores from evaluation metrics
    const ev = completed.evaluation;
    const scores = {
      overall: ev?.overallScore ?? 50,
      toneAdherence: ev?.metrics?.toneProfessional ? (ev.overallScore >= 70 ? 90 : 70) : 30,
      objectionHandling: ev?.metrics?.objectionsHandled ? Math.min(ev.metrics.objectionsHandled * 50, 100) : 25,
      identityLock: ev?.metrics?.identityConfirmation ? 95 : 20,
      callFlow: Math.min(100, Math.round(
        ((ev?.metrics?.qualificationQuestions ?? 0) >= 2 ? 33 : (ev?.metrics?.qualificationQuestions ?? 0) >= 1 ? 20 : 0) +
        (ev?.metrics?.valuePropositionDelivered ? 34 : 0) +
        (ev?.metrics?.callToActionDelivered ? 33 : 0)
      )),
    };

    // Save to simulation history
    try {
      const agent2 = getVoiceAgentOrThrow();
      const store2 = await ensureStore(agent2.versionControl.currentVersion, agent2.promptVersion);
      ensureStoreDefaults(store2);
      const simRecord: SimulationRecord = {
        id: crypto.randomUUID(),
        runAt: new Date().toISOString(),
        runBy: getUserId(req),
        scenarioId: data.scenarioId || 'custom',
        scenarioTitle: preset?.title || 'Custom Scenario',
        personaId: data.personaId || 'neutral_dm',
        turns: completed.currentTurn,
        transcript: transcriptPreview,
        scores,
        evaluation: {
          recommendations: ev?.recommendations || [],
          conversationStages: ev?.conversationStages || [],
        },
      };
      store2.simulationHistory!.unshift(simRecord);
      if (store2.simulationHistory!.length > 100) {
        store2.simulationHistory = store2.simulationHistory!.slice(0, 100);
      }
      addActivityEntry(store2, getUserId(req), 'Ran simulation', `Scenario: ${simRecord.scenarioTitle}, Score: ${scores.overall}`, 'simulation');
      await persistStore(store2);
    } catch { /* non-blocking: don't fail simulation if history save fails */ }

    res.json({
      success: true,
      simulation: {
        sessionId: completed.id,
        status: completed.status,
        turns: completed.currentTurn,
        transcriptPreview: fullTranscript,
        scores,
        draftVersion,
        draftSectionCount,
        usedDraftPrompt: !!draftSystemPrompt,
      },
      analysis: completed.evaluation || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Simulation failed' });
  }
});

router.get('/versions', async (_req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);

    res.json({
      published: {
        currentVersion: agent.versionControl.currentVersion,
        promptHash: agent.promptVersion,
        snapshots: agent.getVersionHistory(),
      },
      draft: {
        currentDraftVersion: store.draftVersion,
        history: store.history.slice(-25).reverse(),
      },
      publishHistory: store.publishHistory.slice(-25).reverse(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch versions' });
  }
});

router.post('/publish', async (req: Request, res: Response) => {
  try {
    // Voice trainers must use the approval workflow — they cannot publish directly
    if (isVoiceTrainerOnly(req)) {
      return res.status(403).json({ error: 'Voice trainers must submit changes for admin approval. Use "Submit for Approval" instead.' });
    }

    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : 'Approved promotion from draft to published';
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    const editor = getUserId(req);

    let sectionChanges = 0;
    for (const section of agent.promptSections) {
      const draftSection = store.sections[section.id];
      if (!draftSection) continue;
      if (draftSection.content !== section.content) {
        unifiedAgentRegistry.updateAgentPromptSection('voice', section.id, draftSection.content, editor, `Published from Voice Training Dashboard: ${note}`);
        sectionChanges += 1;
      }
    }

    const refreshedAgent = getVoiceAgentOrThrow();

    store.publishedVersion = refreshedAgent.versionControl.currentVersion;
    store.publishedPromptHash = refreshedAgent.promptVersion;
    store.updatedAt = new Date().toISOString();
    store.lastEditor = editor;
    store.publishHistory.push({
      publishedVersion: refreshedAgent.versionControl.currentVersion,
      publishedAt: new Date().toISOString(),
      publishedBy: editor,
      note,
      sectionChanges,
    });

    for (const section of refreshedAgent.promptSections) {
      store.sections[section.id] = {
        sectionId: section.id,
        name: section.name,
        category: section.category,
        content: section.content,
        lastEditedAt: new Date().toISOString(),
        lastEditedBy: editor,
      };
    }

    addActivityEntry(store, editor, 'Published version', `Published v${refreshedAgent.versionControl.currentVersion} — ${note} (${sectionChanges} sections)`, 'publish');
    await persistStore(store);

    res.json({
      success: true,
      message: 'Draft promoted to published voice agent version',
      sectionChanges,
      publishedVersion: refreshedAgent.versionControl.currentVersion,
      promptHash: refreshedAgent.promptVersion,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to publish draft' });
  }
});

router.post('/rollback-draft/:version', async (req: Request, res: Response) => {
  try {
    const version = Number.parseInt(req.params.version, 10);
    if (!Number.isFinite(version)) {
      return res.status(400).json({ error: 'Version must be a number' });
    }

    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    const snapshot = store.history.find((h) => h.version === version);
    if (!snapshot) {
      return res.status(404).json({ error: `Draft version ${version} not found` });
    }

    store.sections = JSON.parse(JSON.stringify(snapshot.sections));
    store.draftVersion += 1;
    store.updatedAt = new Date().toISOString();
    store.lastEditor = getUserId(req);
    addActivityEntry(store, getUserId(req), 'Rolled back draft', `Rolled back to draft version ${version}`, 'edit');
    await persistStore(store);

    res.json({ success: true, restoredFromVersion: version, currentDraftVersion: store.draftVersion });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to rollback draft' });
  }
});

// ── Approval Workflow Endpoints ──────────────────────────────────────────────

// Voice trainers submit a publish request for admin approval
router.post('/request-publish', async (req: Request, res: Response) => {
  try {
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!note) {
      return res.status(400).json({ error: 'A description of changes is required when submitting for approval.' });
    }

    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    if (!store.pendingPublishRequests) store.pendingPublishRequests = [];

    // Check for existing pending request
    const hasPending = store.pendingPublishRequests.some((r) => r.status === 'pending');
    if (hasPending) {
      return res.status(409).json({ error: 'A publish request is already pending admin approval. Please wait for it to be reviewed.' });
    }

    // Compute section diffs
    const sectionChanges: SectionChange[] = [];
    for (const section of agent.promptSections) {
      const draftSection = store.sections[section.id];
      if (!draftSection) continue;
      if (draftSection.content !== section.content) {
        sectionChanges.push({
          sectionId: section.id,
          name: section.name,
          oldContent: section.content,
          newContent: draftSection.content,
        });
      }
    }

    if (sectionChanges.length === 0) {
      return res.status(400).json({ error: 'No changes detected between draft and published version.' });
    }

    const request: PendingPublishRequest = {
      id: crypto.randomUUID(),
      requestedBy: getUserId(req),
      requestedAt: new Date().toISOString(),
      note,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      draftVersion: store.draftVersion,
      sectionChanges,
    };

    store.pendingPublishRequests.push(request);
    store.updatedAt = new Date().toISOString();
    addActivityEntry(store, getUserId(req), 'Requested publish', `Requested publish approval: ${note} (${sectionChanges.length} sections)`, 'approval');
    await persistStore(store);

    res.json({ success: true, requestId: request.id, sectionChanges: sectionChanges.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to submit publish request' });
  }
});

// List publish requests (voice trainers see own, admins see all)
router.get('/publish-requests', async (req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    const requests = store.pendingPublishRequests || [];
    const userId = getUserId(req);

    // Voice trainers only see their own requests
    const filtered = isVoiceTrainerOnly(req)
      ? requests.filter((r) => r.requestedBy === userId)
      : requests;

    res.json({ requests: filtered.slice(-25).reverse() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch publish requests' });
  }
});

// Admin approves a publish request → executes the actual publish
router.post('/publish-requests/:id/approve', async (req: Request, res: Response) => {
  try {
    if (isVoiceTrainerOnly(req)) {
      return res.status(403).json({ error: 'Only administrators can approve publish requests.' });
    }

    const requestId = req.params.id;
    const reviewNote = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    if (!store.pendingPublishRequests) store.pendingPublishRequests = [];

    const publishRequest = store.pendingPublishRequests.find((r) => r.id === requestId);
    if (!publishRequest) {
      return res.status(404).json({ error: 'Publish request not found' });
    }
    if (publishRequest.status !== 'pending') {
      return res.status(400).json({ error: `Request already ${publishRequest.status}` });
    }

    // Execute the actual publish using the draft sections
    const editor = getUserId(req);
    let sectionChanges = 0;
    for (const change of publishRequest.sectionChanges) {
      unifiedAgentRegistry.updateAgentPromptSection(
        'voice',
        change.sectionId,
        change.newContent,
        editor,
        `Approved publish from Voice Training Dashboard: ${publishRequest.note}`
      );
      sectionChanges += 1;
    }

    const refreshedAgent = getVoiceAgentOrThrow();

    // Update store with new published state
    store.publishedVersion = refreshedAgent.versionControl.currentVersion;
    store.publishedPromptHash = refreshedAgent.promptVersion;
    store.updatedAt = new Date().toISOString();
    store.lastEditor = editor;
    store.publishHistory.push({
      publishedVersion: refreshedAgent.versionControl.currentVersion,
      publishedAt: new Date().toISOString(),
      publishedBy: editor,
      note: `Approved: ${publishRequest.note}${reviewNote ? ` | Admin note: ${reviewNote}` : ''}`,
      sectionChanges,
    });

    // Reset draft sections to match published
    for (const section of refreshedAgent.promptSections) {
      store.sections[section.id] = {
        sectionId: section.id,
        name: section.name,
        category: section.category,
        content: section.content,
        lastEditedAt: new Date().toISOString(),
        lastEditedBy: editor,
      };
    }

    // Mark request as approved
    publishRequest.status = 'approved';
    publishRequest.reviewedBy = editor;
    publishRequest.reviewedAt = new Date().toISOString();
    publishRequest.reviewNote = reviewNote || null;

    addActivityEntry(store, editor, 'Approved publish', `Approved publish request by ${publishRequest.requestedBy}: ${publishRequest.note}`, 'approval');
    await persistStore(store);

    res.json({
      success: true,
      message: 'Publish request approved and promoted to production',
      sectionChanges,
      publishedVersion: refreshedAgent.versionControl.currentVersion,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to approve publish request' });
  }
});

// ── Simulation History ─────────────────────────────────────────────────

router.get('/simulation-history', async (req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const userId = getUserId(req);
    const records = isVoiceTrainerOnly(req)
      ? store.simulationHistory!.filter(r => r.runBy === userId)
      : store.simulationHistory!;

    res.json({ records: records.slice(0, limit) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch simulation history' });
  }
});

// ── Activity Log ───────────────────────────────────────────────────────

router.get('/activity-log', async (req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);

    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const category = req.query.category as string | undefined;
    let entries = store.activityLog!;
    if (category) {
      entries = entries.filter(e => e.category === category);
    }

    res.json({ entries: entries.slice(0, limit) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch activity log' });
  }
});

// ── Custom Scenarios CRUD ──────────────────────────────────────────────

const customScenarioSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  defaultPersonaId: z.string().default('friendly_dm'),
  defaultObjections: z.array(z.string()).max(10).default([]),
});

router.post('/custom-scenarios', async (req: Request, res: Response) => {
  try {
    const parsed = customScenarioSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid scenario payload', details: parsed.error.format() });

    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);

    const scenario: CustomScenario = {
      id: crypto.randomUUID(),
      ...parsed.data,
      createdBy: getUserId(req),
      createdAt: new Date().toISOString(),
      isApproved: !isVoiceTrainerOnly(req),
    };
    store.customScenarios!.push(scenario);
    addActivityEntry(store, getUserId(req), 'Created scenario', `Created custom scenario: ${scenario.title}`, 'scenario');
    await persistStore(store);

    res.json({ success: true, scenario });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create custom scenario' });
  }
});

router.get('/custom-scenarios', async (req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);
    const userId = getUserId(req);
    const scenarios = store.customScenarios!.filter(
      s => s.isApproved || s.createdBy === userId || !isVoiceTrainerOnly(req)
    );
    res.json({ scenarios });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch custom scenarios' });
  }
});

router.delete('/custom-scenarios/:id', async (req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);
    const userId = getUserId(req);
    const idx = store.customScenarios!.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Scenario not found' });
    const scenario = store.customScenarios![idx];
    if (isVoiceTrainerOnly(req) && scenario.createdBy !== userId) {
      return res.status(403).json({ error: 'Cannot delete another user\'s scenario' });
    }
    store.customScenarios!.splice(idx, 1);
    addActivityEntry(store, userId, 'Deleted scenario', `Deleted custom scenario: ${scenario.title}`, 'scenario');
    await persistStore(store);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete scenario' });
  }
});

router.post('/custom-scenarios/:id/approve', async (req: Request, res: Response) => {
  try {
    if (isVoiceTrainerOnly(req)) return res.status(403).json({ error: 'Only admins can approve scenarios' });
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);
    const scenario = store.customScenarios!.find(s => s.id === req.params.id);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
    scenario.isApproved = true;
    addActivityEntry(store, getUserId(req), 'Approved scenario', `Approved custom scenario: ${scenario.title}`, 'scenario');
    await persistStore(store);
    res.json({ success: true, scenario });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to approve scenario' });
  }
});

// ── Section Comments CRUD ──────────────────────────────────────────────

const commentSchema = z.object({ content: z.string().min(1).max(2000) });

router.post('/sections/:sectionId/comments', async (req: Request, res: Response) => {
  try {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid comment', details: parsed.error.format() });

    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);
    const sectionId = req.params.sectionId;
    if (!store.sectionComments![sectionId]) store.sectionComments![sectionId] = [];
    const comment: SectionComment = {
      id: crypto.randomUUID(),
      sectionId,
      userId: getUserId(req),
      createdAt: new Date().toISOString(),
      content: parsed.data.content,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
    };
    store.sectionComments![sectionId].push(comment);
    addActivityEntry(store, getUserId(req), 'Added comment', `Commented on section ${sectionId}`, 'comment');
    await persistStore(store);
    res.json({ success: true, comment });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to add comment' });
  }
});

router.get('/sections/:sectionId/comments', async (req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);
    const comments = store.sectionComments![req.params.sectionId] || [];
    res.json({ comments });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch comments' });
  }
});

router.post('/sections/:sectionId/comments/:commentId/resolve', async (req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);
    const comments = store.sectionComments![req.params.sectionId] || [];
    const comment = comments.find(c => c.id === req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    comment.resolved = true;
    comment.resolvedBy = getUserId(req);
    comment.resolvedAt = new Date().toISOString();
    addActivityEntry(store, getUserId(req), 'Resolved comment', `Resolved comment on section ${req.params.sectionId}`, 'comment');
    await persistStore(store);
    res.json({ success: true, comment });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to resolve comment' });
  }
});

// ── Snippet Library CRUD ───────────────────────────────────────────────

const snippetSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  category: z.string().min(1).max(100),
});

router.post('/snippets', async (req: Request, res: Response) => {
  try {
    const parsed = snippetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid snippet', details: parsed.error.format() });

    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);
    const snippet: PromptSnippet = {
      id: crypto.randomUUID(),
      ...parsed.data,
      createdBy: getUserId(req),
      createdAt: new Date().toISOString(),
      isApproved: !isVoiceTrainerOnly(req),
    };
    store.snippets!.push(snippet);
    addActivityEntry(store, getUserId(req), 'Created snippet', `Created snippet: ${snippet.title}`, 'snippet');
    await persistStore(store);
    res.json({ success: true, snippet });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create snippet' });
  }
});

router.get('/snippets', async (req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);
    const userId = getUserId(req);
    const snippets = store.snippets!.filter(
      s => s.isApproved || s.createdBy === userId || !isVoiceTrainerOnly(req)
    );
    res.json({ snippets });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch snippets' });
  }
});

router.delete('/snippets/:id', async (req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);
    const userId = getUserId(req);
    const idx = store.snippets!.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Snippet not found' });
    const snippet = store.snippets![idx];
    if (isVoiceTrainerOnly(req) && snippet.createdBy !== userId) {
      return res.status(403).json({ error: 'Cannot delete another user\'s snippet' });
    }
    store.snippets!.splice(idx, 1);
    addActivityEntry(store, userId, 'Deleted snippet', `Deleted snippet: ${snippet.title}`, 'snippet');
    await persistStore(store);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete snippet' });
  }
});

router.post('/snippets/:id/approve', async (req: Request, res: Response) => {
  try {
    if (isVoiceTrainerOnly(req)) return res.status(403).json({ error: 'Only admins can approve snippets' });
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);
    const snippet = store.snippets!.find(s => s.id === req.params.id);
    if (!snippet) return res.status(404).json({ error: 'Snippet not found' });
    snippet.isApproved = true;
    addActivityEntry(store, getUserId(req), 'Approved snippet', `Approved snippet: ${snippet.title}`, 'snippet');
    await persistStore(store);
    res.json({ success: true, snippet });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to approve snippet' });
  }
});

// ── Production Sections + Diff ─────────────────────────────────────────

router.get('/production-sections', async (_req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const sections: Record<string, { name: string; content: string; category: string }> = {};
    for (const s of agent.promptSections) {
      sections[s.id] = { name: s.name, content: s.content, category: s.category };
    }
    res.json({ sections });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch production sections' });
  }
});

router.get('/diff/:versionA/:versionB', async (req: Request, res: Response) => {
  try {
    const vA = Number.parseInt(req.params.versionA, 10);
    const vB = Number.parseInt(req.params.versionB, 10);
    if (!Number.isFinite(vA) || !Number.isFinite(vB)) {
      return res.status(400).json({ error: 'Version must be a number' });
    }

    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    const snapshotA = store.history.find(h => h.version === vA);
    const snapshotB = store.history.find(h => h.version === vB);
    if (!snapshotA || !snapshotB) {
      return res.status(404).json({ error: 'One or both versions not found in history' });
    }

    const modifications: { sectionId: string; name: string; oldContent: string; newContent: string; diff: { type: string; line: string }[] }[] = [];
    const additions: { sectionId: string; name: string; content: string }[] = [];
    const removals: { sectionId: string; name: string; content: string }[] = [];

    const allSectionIds = new Set([...Object.keys(snapshotA.sections), ...Object.keys(snapshotB.sections)]);
    for (const sid of allSectionIds) {
      const a = snapshotA.sections[sid];
      const b = snapshotB.sections[sid];
      if (a && b) {
        if (a.content !== b.content) {
          modifications.push({ sectionId: sid, name: b.name, oldContent: a.content, newContent: b.content, diff: computeLineDiff(a.content, b.content) });
        }
      } else if (b && !a) {
        additions.push({ sectionId: sid, name: b.name, content: b.content });
      } else if (a && !b) {
        removals.push({ sectionId: sid, name: a.name, content: a.content });
      }
    }

    res.json({ versionA: vA, versionB: vB, additions, removals, modifications });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to compute diff' });
  }
});

// ── Real Call Transcripts ──────────────────────────────────────────────

router.get('/real-transcripts', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const offset = Number(req.query.offset) || 0;

    // Dynamic import of db to avoid circular deps
    const { db } = await import('../db');
    const { callSessions, dialerCallAttempts, contacts } = await import('@shared/schema');
    const { sql, desc, isNotNull, eq } = await import('drizzle-orm');

    const rows = await db
      .select({
        id: callSessions.id,
        campaignId: callSessions.campaignId,
        contactName: sql<string>`COALESCE(${contacts.firstName} || ' ' || ${contacts.lastName}, 'Unknown')`,
        transcript: callSessions.aiTranscript,
        duration: callSessions.durationSec,
        disposition: callSessions.aiDisposition,
        calledAt: callSessions.createdAt,
      })
      .from(callSessions)
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .where(isNotNull(callSessions.aiTranscript))
      .orderBy(desc(callSessions.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ transcripts: rows.map(r => ({ ...r, agentType: 'ai' })) });
  } catch (error: any) {
    // If DB not available, return empty
    res.json({ transcripts: [] });
  }
});

// ── Audio Preview (proxy) ──────────────────────────────────────────────

router.post('/audio-preview', async (req: Request, res: Response) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const voiceId = typeof req.body?.voiceId === 'string' ? req.body.voiceId.trim() : '';
    const provider = typeof req.body?.provider === 'string' ? req.body.provider.trim() : 'google';
    if (!text || !voiceId) return res.status(400).json({ error: 'text and voiceId required' });

    // Forward to internal voice-providers route
    const { default: fetch } = await import('node-fetch');
    const port = process.env.PORT || 5000;
    const internalUrl = `http://localhost:${port}/api/voice-providers/preview`;
    const resp = await (fetch as any)(internalUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId, provider }),
    });

    if (!resp.ok) {
      return res.status(resp.status).json({ error: 'Audio preview generation failed' });
    }

    const contentType = resp.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    const buffer = await resp.buffer();
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Audio preview failed' });
  }
});

// ── Live Voice Test Endpoints ────────────────────────────────────────────────

// Build the full system prompt from current draft sections for live voice testing
router.get('/live-test/draft-prompt', async (req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);

    // Optional: filter by specific section IDs
    const sectionIdsParam = typeof req.query.sectionIds === 'string' ? req.query.sectionIds : '';
    const requestedIds = sectionIdsParam ? sectionIdsParam.split(',').filter(Boolean) : null;

    // Optional: include scenario context
    const scenarioIdParam = typeof req.query.scenarioId === 'string' ? req.query.scenarioId : '';
    const scenario = scenarioIdParam ? scenarioPresets.find(s => s.id === scenarioIdParam) : null;

    // Order sections by category priority for coherent prompt assembly
    const categoryOrder: Record<string, number> = {
      identity: 0, rules: 1, compliance: 2, script: 3, objection: 4, closing: 5, general: 6,
    };
    let sortedSections = Object.values(store.sections).sort(
      (a, b) => (categoryOrder[a.category] ?? 99) - (categoryOrder[b.category] ?? 99)
    );

    if (requestedIds) {
      sortedSections = sortedSections.filter(s => requestedIds.includes(s.sectionId));
    }

    const promptParts: string[] = [];
    for (const section of sortedSections) {
      if (section.content.trim()) {
        promptParts.push(`## ${section.name}\n${section.content}`);
      }
    }

    let fullPrompt = promptParts.join('\n\n');

    // Append scenario context if provided
    if (scenario) {
      fullPrompt += `\n\n## Test Scenario: ${scenario.title}\n${scenario.description}\nExpected objections: ${scenario.defaultObjections.join('; ')}`;
    }

    res.json({
      prompt: fullPrompt,
      voiceId: store.voiceConfig.voiceId,
      draftVersion: store.draftVersion,
      sectionCount: sortedSections.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to build draft prompt' });
  }
});

// Score a live test transcript and save the result
const liveTestResultSchema = z.object({
  transcript: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    timestamp: z.string(),
  })),
  durationSec: z.number().min(0),
  voiceId: z.string(),
  startedAt: z.string(),
});

function scoreLiveTestTranscript(transcript: LiveTestTranscriptTurn[]): { scores: LiveTestScores; evaluation: { recommendations: string[]; conversationStages: string[] } } {
  const agentTurns = transcript.filter(t => t.role === 'assistant').map(t => t.text.toLowerCase());
  const userTurns = transcript.filter(t => t.role === 'user').map(t => t.text.toLowerCase());
  const allAgentText = agentTurns.join(' ');
  const allUserText = userTurns.join(' ');

  // Identity confirmation detection
  const identityPatterns = /\b(my name is|i('?m| am) (calling|reaching out)|this is|i represent|on behalf of|pivotal)\b/i;
  const identityConfirmed = identityPatterns.test(allAgentText);

  // Qualification questions detection
  const questionMarks = (allAgentText.match(/\?/g) || []).length;
  const qualificationQuestions = Math.min(questionMarks, 5);

  // Objection handling detection
  const objectionPatterns = /\b(understand|appreciate|hear you|that('?s| is) (fair|valid)|good (point|question)|absolutely|let me address)\b/i;
  const objectionHandled = objectionPatterns.test(allAgentText) && userTurns.length > 1;

  // Value proposition detection
  const valuePatterns = /\b(benefit|value|help|improve|increase|reduce|save|solution|result|outcome|roi)\b/i;
  const valueDelivered = valuePatterns.test(allAgentText);

  // Call-to-action detection
  const ctaPatterns = /\b(schedule|book|meeting|demo|follow.?up|next step|send|calendar|availab)\b/i;
  const ctaDelivered = ctaPatterns.test(allAgentText);

  // Tone professionalism (absence of negative patterns)
  const unprofessionalPatterns = /\b(um+|uh+|like,|you know,|whatever|dude|bro|crap|damn)\b/i;
  const toneProfessional = !unprofessionalPatterns.test(allAgentText);

  // Compliance: no unauthorized promises, no personal info requests
  const complianceViolations = /\b(guarantee|promise (you )?100%|social security|credit card|bank account)\b/i.test(allAgentText);

  // Calculate overall score (0-100)
  let overall = 50;
  if (identityConfirmed) overall += 10;
  if (qualificationQuestions >= 2) overall += 15;
  else if (qualificationQuestions >= 1) overall += 8;
  if (objectionHandled) overall += 10;
  if (valueDelivered) overall += 10;
  if (ctaDelivered) overall += 10;
  if (toneProfessional) overall += 5;
  if (complianceViolations) overall -= 20;
  overall = Math.max(0, Math.min(100, overall));

  // Category scores
  const toneAdherence = toneProfessional ? (overall >= 70 ? 90 : 70) : 30;
  const objectionScore = objectionHandled ? 85 : (userTurns.length <= 1 ? 50 : 25);
  const identityScore = identityConfirmed ? 95 : 20;
  const callFlowScore = Math.min(100, Math.round(
    (qualificationQuestions >= 2 ? 33 : qualificationQuestions >= 1 ? 20 : 0) +
    (valueDelivered ? 34 : 0) +
    (ctaDelivered ? 33 : 0)
  ));

  // Build recommendations
  const recommendations: string[] = [];
  if (!identityConfirmed) recommendations.push('Agent should confirm identity early in the conversation.');
  if (qualificationQuestions < 2) recommendations.push('Ask more discovery/qualification questions before pitching.');
  if (!objectionHandled && userTurns.length > 1) recommendations.push('Acknowledge and handle objections more explicitly.');
  if (!valueDelivered) recommendations.push('Deliver a clear value proposition tied to the prospect\'s needs.');
  if (!ctaDelivered) recommendations.push('Include a clear call-to-action (meeting, demo, follow-up).');
  if (!toneProfessional) recommendations.push('Maintain professional tone throughout the conversation.');
  if (complianceViolations) recommendations.push('COMPLIANCE: Remove unauthorized guarantees or sensitive data requests.');
  if (recommendations.length === 0) recommendations.push('Strong performance across all categories. Continue refining.');

  // Detect conversation stages
  const stages: string[] = ['opening'];
  if (identityConfirmed) stages.push('identity_confirmation');
  if (qualificationQuestions >= 1) stages.push('discovery');
  if (objectionHandled) stages.push('objection_handling');
  if (valueDelivered) stages.push('value_proposition');
  if (ctaDelivered) stages.push('call_to_action');
  stages.push('closing');

  return {
    scores: { overall, toneAdherence, objectionHandling: objectionScore, identityLock: identityScore, callFlow: callFlowScore },
    evaluation: { recommendations, conversationStages: stages },
  };
}

router.post('/live-test/result', async (req: Request, res: Response) => {
  try {
    const parsed = liveTestResultSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid live test result payload', details: parsed.error.format() });
    }

    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);

    const { transcript, durationSec, voiceId, startedAt } = parsed.data;
    const { scores, evaluation } = scoreLiveTestTranscript(transcript);

    const record: LiveTestRecord = {
      id: crypto.randomUUID(),
      startedAt,
      endedAt: new Date().toISOString(),
      userId: getUserId(req),
      voiceId,
      draftVersion: store.draftVersion,
      transcript,
      durationSec,
      scores,
      evaluation,
    };

    store.liveTestHistory!.unshift(record);
    // Cap at 50 entries
    if (store.liveTestHistory!.length > 50) {
      store.liveTestHistory = store.liveTestHistory!.slice(0, 50);
    }
    store.updatedAt = new Date().toISOString();
    await persistStore(store);

    res.json({ success: true, record });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save live test result' });
  }
});

// List live test history
router.get('/live-test/history', async (req: Request, res: Response) => {
  try {
    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    ensureStoreDefaults(store);

    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const userId = getUserId(req);

    // Voice trainers see only their own tests; admins see all
    const records = isVoiceTrainerOnly(req)
      ? store.liveTestHistory!.filter(r => r.userId === userId)
      : store.liveTestHistory!;

    res.json({ records: records.slice(0, limit) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch live test history' });
  }
});

// Admin rejects a publish request with feedback
router.post('/publish-requests/:id/reject', async (req: Request, res: Response) => {
  try {
    if (isVoiceTrainerOnly(req)) {
      return res.status(403).json({ error: 'Only administrators can reject publish requests.' });
    }

    const requestId = req.params.id;
    const reviewNote = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!reviewNote) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }

    const agent = getVoiceAgentOrThrow();
    const store = await ensureStore(agent.versionControl.currentVersion, agent.promptVersion);
    if (!store.pendingPublishRequests) store.pendingPublishRequests = [];

    const publishRequest = store.pendingPublishRequests.find((r) => r.id === requestId);
    if (!publishRequest) {
      return res.status(404).json({ error: 'Publish request not found' });
    }
    if (publishRequest.status !== 'pending') {
      return res.status(400).json({ error: `Request already ${publishRequest.status}` });
    }

    publishRequest.status = 'rejected';
    publishRequest.reviewedBy = getUserId(req);
    publishRequest.reviewedAt = new Date().toISOString();
    publishRequest.reviewNote = reviewNote;

    store.updatedAt = new Date().toISOString();
    addActivityEntry(store, getUserId(req), 'Rejected publish', `Rejected publish request by ${publishRequest.requestedBy}: ${reviewNote}`, 'approval');
    await persistStore(store);

    res.json({ success: true, message: 'Publish request rejected' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to reject publish request' });
  }
});

export default router;
