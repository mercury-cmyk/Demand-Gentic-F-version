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

router.get('/simulation-options', (_req: Request, res: Response) => {
  const personas = Object.entries(DEFAULT_PERSONAS).map(([id, profile]) => ({
    id,
    name: id.replace(/_/g, ' '),
    ...profile,
  }));

  res.json({
    scenarios: scenarioPresets,
    personas,
  });
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
    });

    const completed = await simulationEngine.runFullSimulation(session);
    const transcriptPreview = completed.transcript.slice(0, 12).map((t) => ({ role: t.role, content: t.content }));

    res.json({
      success: true,
      simulation: {
        sessionId: completed.id,
        status: completed.status,
        turns: completed.currentTurn,
        transcriptPreview,
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
    await persistStore(store);

    res.json({ success: true, message: 'Publish request rejected' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to reject publish request' });
  }
});

export default router;
