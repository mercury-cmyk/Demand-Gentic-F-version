import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Bot, FlaskConical, GitBranch, Mic, Play, Save, Upload, Clock, CheckCircle, XCircle, Send } from 'lucide-react';

type DraftSection = {
  sectionId: string;
  name: string;
  category: string;
  content: string;
  lastEditedAt: string;
  lastEditedBy: string | null;
};

type VoiceConfig = {
  provider: string;
  voiceId: string;
  speakingRate: number;
  tone: string;
  clarity: number;
};

type OverviewResponse = {
  production?: {
    version?: string;
  };
};

type DraftResponse = {
  draftVersion: number;
  sections: DraftSection[];
  voiceConfig: VoiceConfig;
};

type VoiceOption = {
  id: string;
  label: string;
};

type VoicesResponse = {
  voices: VoiceOption[];
};

type SampleCampaign = {
  id: string;
  name: string;
};

type SampleAccount = {
  id: string;
  name: string;
};

type SampleContact = {
  id: string;
  name: string;
  title: string;
};

type SampleDatasetResponse = {
  campaigns: SampleCampaign[];
  accounts: SampleAccount[];
  contacts: SampleContact[];
};

type SimulationScenario = {
  id: string;
  title: string;
};

type SimulationPersona = {
  id: string;
  name: string;
};

type SimulationOptionsResponse = {
  scenarios: SimulationScenario[];
  personas: SimulationPersona[];
};

type SimulationResponse = {
  success: boolean;
  simulation: {
    sessionId: string;
    status: string;
    turns: number;
    transcriptPreview: Array<{ role: string; content: string }>;
  };
  analysis: unknown;
};

type DraftHistoryEntry = {
  version: number;
  savedAt: string;
  summary: string;
};

type PublishHistoryEntry = {
  publishedVersion: string;
  publishedAt: string;
  note: string;
  sectionChanges: number;
};

type VersionsResponse = {
  draft?: {
    history?: DraftHistoryEntry[];
  };
  publishHistory?: PublishHistoryEntry[];
};

type PublishRequestSectionChange = {
  sectionId: string;
  name: string;
  oldContent: string;
  newContent: string;
};

type PublishRequest = {
  id: string;
  requestedBy: string;
  requestedAt: string;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  draftVersion: number;
  sectionChanges: PublishRequestSectionChange[];
};

type PublishRequestsResponse = {
  requests: PublishRequest[];
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

const configuredApiOrigin =
  ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)?.trim()?.replace(/\/$/, '') || '';

const configuredExtraApiOriginsRaw =
  ((import.meta as any).env?.VITE_VOICE_TRAINING_API_ORIGINS as string | undefined) || '';

const configuredExtraApiOrigins = configuredExtraApiOriginsRaw
  .split(',')
  .map((entry) => entry.trim().replace(/\/$/, ''))
  .filter(Boolean);

const autoDetectedVoiceApiOrigin =
  typeof window !== 'undefined' && /(^|\.)pivotal-b2b\.com$/i.test(window.location.hostname)
    ? 'https://demandgentic.ai'
    : '';

const productionVoiceApiFallback =
  typeof window !== 'undefined' && !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
    ? 'https://demandgentic.ai'
    : '';

const withApiOrigin = (path: string): string => {
  if (!path.startsWith('/')) return path;
  return path;
};

const API_PATH_BASES = ['/api/voice-agent-training', '/api/unified-agents/voice-training'];

const getApiBases = (): string[] => {
  const knownProductionOrigins = [
    'https://demandgentic.ai',
    'https://www.demandgentic.ai',
    'https://pivotal-b2b.com',
    'https://www.pivotal-b2b.com',
  ];

  const originCandidates = [
    configuredApiOrigin,
    '',
    autoDetectedVoiceApiOrigin,
    productionVoiceApiFallback,
    ...configuredExtraApiOrigins,
    ...knownProductionOrigins,
  ];

  return Array.from(new Set(originCandidates.filter(Boolean).map((entry) => entry.replace(/\/$/, '')))).flatMap((origin) =>
    API_PATH_BASES.map((pathBase) => (origin ? `${origin}${withApiOrigin(pathBase)}` : withApiOrigin(pathBase))),
  ).concat(API_PATH_BASES);
};

const isLikelyHtmlFallback = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('<!doctype') || normalized.startsWith('<html');
};

const roleHelpText = 'Required role: admin, campaign_manager, quality_analyst (aliases: manager, qa_analyst).';
const apiHelpText =
  'If this persists in production, set VITE_API_BASE_URL to your backend origin so API calls do not hit the frontend HTML fallback. On pivotal-b2b.com we auto-try https://demandgentic.ai as a backup.';
const localhostHelpText =
  typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
    ? ' Local dev detected: configure VITE_VOICE_TRAINING_PROXY_TARGET (or VITE_API_BASE_URL) and restart the Vite dev server so /api routes proxy to backend instead of returning index.html.'
    : '';

async function trainingApiRequest<T>(
  method: string,
  routePath: string,
  data?: unknown,
): Promise<T> {
  const apiBases = Array.from(new Set(getApiBases()));
  let lastError: unknown;
  const attemptErrors: string[] = [];

  for (let index = 0; index < apiBases.length; index += 1) {
    const base = apiBases[index];
    const url = `${base}${routePath}`;
    try {
      const response = await apiRequest(method, url, data);
      const contentType = (response.headers.get('content-type') || '').toLowerCase();

      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      }

      const text = await response.text();
      if (isLikelyHtmlFallback(text)) {
        throw new Error(
          `API returned HTML instead of JSON at ${url}. This usually means auth/session or gateway routing is blocking the API. ${roleHelpText} ${apiHelpText}${localhostHelpText}`,
        );
      }

      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      attemptErrors.push(`${url} -> ${getErrorMessage(error)}`);
      // Continue trying all configured origins/paths before failing.
    }
  }

  const currentHost = typeof window !== 'undefined' ? window.location.origin : 'unknown-host';
  const consolidated = `Voice Agent Training request failed after trying ${apiBases.length} endpoint(s) from ${currentHost}. ${attemptErrors.join(' | ')}`;
  throw lastError instanceof Error ? new Error(consolidated) : new Error(consolidated);
}

export default function VoiceAgentTrainingDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Determine role for conditional UI
  const userRoles: string[] = (user as any)?.roles || (user?.role ? [user.role] : []);
  const isVoiceTrainer = userRoles.includes('voice_trainer') && !userRoles.includes('admin');
  const isAdmin = userRoles.includes('admin');

  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [sectionContent, setSectionContent] = useState('');
  const [changeLog, setChangeLog] = useState('');

  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({
    provider: 'gemini_live',
    voiceId: 'Fenrir',
    speakingRate: 1,
    tone: 'professional',
    clarity: 1,
  });

  const [scenarioId, setScenarioId] = useState('gatekeeper_handoff');
  const [personaId, setPersonaId] = useState('neutral_dm');
  const [campaignId, setCampaignId] = useState('demo-camp-1');
  const [accountId, setAccountId] = useState('demo-acct-1');
  const [contactId, setContactId] = useState('demo-contact-1');
  const [simulationInput, setSimulationInput] = useState('Run identity lock and gatekeeper protocol behavior.');
  const [publishNote, setPublishNote] = useState(isVoiceTrainer ? '' : 'Approved after simulation review.');
  const [approvalReviewNote, setApprovalReviewNote] = useState('');
  const [rejectionNote, setRejectionNote] = useState('');

  const overviewQuery = useQuery<OverviewResponse>({
    queryKey: ['voice-training-overview'],
    queryFn: async () => trainingApiRequest<OverviewResponse>('GET', '/overview'),
  });

  const draftQuery = useQuery<DraftResponse>({
    queryKey: ['voice-training-draft'],
    queryFn: async () => trainingApiRequest<DraftResponse>('GET', '/draft'),
  });

  const versionsQuery = useQuery<VersionsResponse>({
    queryKey: ['voice-training-versions'],
    queryFn: async () => trainingApiRequest<VersionsResponse>('GET', '/versions'),
  });

  const voicesQuery = useQuery<VoicesResponse>({
    queryKey: ['voice-training-voices'],
    queryFn: async () => trainingApiRequest<VoicesResponse>('GET', '/voices'),
  });

  const sampleDataQuery = useQuery<SampleDatasetResponse>({
    queryKey: ['voice-training-sample-data'],
    queryFn: async () => trainingApiRequest<SampleDatasetResponse>('GET', '/sample-dataset'),
  });

  const simulationOptionsQuery = useQuery<SimulationOptionsResponse>({
    queryKey: ['voice-training-simulation-options'],
    queryFn: async () => trainingApiRequest<SimulationOptionsResponse>('GET', '/simulation-options'),
  });

  const sections = draftQuery.data?.sections || [];

  useEffect(() => {
    if (!sections.length) return;
    if (!selectedSectionId) {
      setSelectedSectionId(sections[0].sectionId);
      setSectionContent(sections[0].content);
      return;
    }
    const selected = sections.find((s) => s.sectionId === selectedSectionId);
    if (selected) {
      setSectionContent(selected.content);
    }
  }, [sections, selectedSectionId]);

  useEffect(() => {
    if (draftQuery.data?.voiceConfig) {
      setVoiceConfig(draftQuery.data.voiceConfig);
    }
  }, [draftQuery.data?.voiceConfig]);

  const selectedSection = useMemo(
    () => sections.find((s) => s.sectionId === selectedSectionId) || null,
    [sections, selectedSectionId]
  );

  const saveSectionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSectionId) throw new Error('Select a section first.');
      return trainingApiRequest<{ success: boolean }>('PUT', `/draft/sections/${selectedSectionId}`, {
        content: sectionContent,
        changeLog,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['voice-training-draft'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-versions'] }),
      ]);
      setChangeLog('');
      toast({ title: 'Draft updated', description: 'Prompt section saved as a new draft version.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Failed to save draft', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const saveVoiceConfigMutation = useMutation({
    mutationFn: async () => trainingApiRequest<{ success: boolean }>('PUT', '/voice-config', voiceConfig),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['voice-training-draft'] });
      toast({ title: 'Voice config saved', description: 'Gemini voice settings are now bound to this draft.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Failed to save voice config', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const simulationMutation = useMutation<SimulationResponse>({
    mutationFn: async () =>
      trainingApiRequest<SimulationResponse>('POST', '/simulate', {
        scenarioId,
        personaId,
        campaignId,
        accountId,
        contactId,
        inputScenario: simulationInput,
      }),
  });

  const publishMutation = useMutation({
    mutationFn: async () => trainingApiRequest<{ success: boolean }>('POST', '/publish', { note: publishNote }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['voice-training-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-draft'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-versions'] }),
      ]);
      toast({ title: 'Published', description: 'Draft promoted to production unified voice version.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Publish failed', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (version: number) => trainingApiRequest<{ success: boolean }>('POST', `/rollback-draft/${version}`, {}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['voice-training-draft'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-versions'] }),
      ]);
      toast({ title: 'Draft restored', description: 'Rollback complete.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Rollback failed', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  // ── Approval Workflow ──────────────────────────────────────────────

  const publishRequestsQuery = useQuery<PublishRequestsResponse>({
    queryKey: ['voice-training-publish-requests'],
    queryFn: async () => trainingApiRequest<PublishRequestsResponse>('GET', '/publish-requests'),
  });

  const requestPublishMutation = useMutation({
    mutationFn: async () => trainingApiRequest<{ success: boolean }>('POST', '/request-publish', { note: publishNote }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['voice-training-publish-requests'] });
      setPublishNote('');
      toast({ title: 'Submitted for approval', description: 'Your publish request has been sent to an administrator for review.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Submit failed', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const approveRequestMutation = useMutation({
    mutationFn: async (requestId: string) => trainingApiRequest<{ success: boolean }>('POST', `/publish-requests/${requestId}/approve`, { note: approvalReviewNote }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['voice-training-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-draft'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-versions'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-publish-requests'] }),
      ]);
      setApprovalReviewNote('');
      toast({ title: 'Approved & Published', description: 'Changes have been promoted to production.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Approval failed', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async (requestId: string) => trainingApiRequest<{ success: boolean }>('POST', `/publish-requests/${requestId}/reject`, { note: rejectionNote }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['voice-training-publish-requests'] });
      setRejectionNote('');
      toast({ title: 'Rejected', description: 'Publish request has been rejected with feedback.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Rejection failed', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const pendingRequests = (publishRequestsQuery.data?.requests || []).filter((r) => r.status === 'pending');

  const loading = overviewQuery.isLoading || draftQuery.isLoading;
  const hasLoadError = overviewQuery.isError || draftQuery.isError;

  const loadErrorMessage = overviewQuery.error
    ? getErrorMessage(overviewQuery.error)
    : draftQuery.error
      ? getErrorMessage(draftQuery.error)
      : 'Unknown error';

  if (loading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">Loading voice agent training dashboard...</CardContent>
        </Card>
      </div>
    );
  }

  if (hasLoadError) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unable to load Voice Agent Training data</CardTitle>
            <CardDescription>
              {loadErrorMessage}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => {
                overviewQuery.refetch();
                draftQuery.refetch();
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Voice Agent Training Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dedicated development preview layer for unified voice prompt iteration, simulation, and controlled publish.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">Production v{overviewQuery.data?.production?.version || 'n/a'}</Badge>
          <Badge variant="secondary">Draft v{draftQuery.data?.draftVersion || 'n/a'}</Badge>
        </div>
      </div>

      <Tabs defaultValue="prompts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prompts">Prompt Management</TabsTrigger>
          <TabsTrigger value="simulation">Simulation</TabsTrigger>
          <TabsTrigger value="versions">Version Control</TabsTrigger>
          <TabsTrigger value="data">Sample Dataset</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Prompt Modules</CardTitle>
                <CardDescription>Unified schema modules (draft-editable)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[420px] overflow-auto">
                {sections.map((section) => (
                  <button
                    key={section.sectionId}
                    type="button"
                    className={`w-full text-left p-2 rounded border text-xs ${selectedSectionId === section.sectionId ? 'border-primary bg-primary/5' : 'border-border'}`}
                    onClick={() => setSelectedSectionId(section.sectionId)}
                  >
                    <div className="font-medium">{section.name}</div>
                    <div className="text-muted-foreground mt-1">{section.category}</div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">{selectedSection?.name || 'Select a section'}</CardTitle>
                <CardDescription>
                  {selectedSection ? `Last edited ${new Date(selectedSection.lastEditedAt).toLocaleString()}` : 'Choose a section to edit'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={sectionContent}
                  onChange={(e) => setSectionContent(e.target.value)}
                  className="min-h-[280px] font-mono text-xs"
                  placeholder="Edit prompt section content"
                />
                <Input
                  value={changeLog}
                  onChange={(e) => setChangeLog(e.target.value)}
                  placeholder="Change log (required)"
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveSectionMutation.mutate()}
                    disabled={!selectedSectionId || !changeLog.trim() || saveSectionMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Draft Version
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Mic className="h-4 w-4" /> Gemini Voice Configuration</CardTitle>
              <CardDescription>Bound to current draft and promoted with publish</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <Label>Provider</Label>
                <Input value={voiceConfig.provider} onChange={(e) => setVoiceConfig((prev) => ({ ...prev, provider: e.target.value }))} />
              </div>
              <div>
                <Label>Voice ID</Label>
                <Select value={voiceConfig.voiceId} onValueChange={(v) => setVoiceConfig((prev) => ({ ...prev, voiceId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(voicesQuery.data?.voices || []).map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>{voice.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Speaking Rate</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={voiceConfig.speakingRate}
                  onChange={(e) => setVoiceConfig((prev) => ({ ...prev, speakingRate: Number(e.target.value) || 1 }))}
                />
              </div>
              <div>
                <Label>Tone</Label>
                <Input value={voiceConfig.tone} onChange={(e) => setVoiceConfig((prev) => ({ ...prev, tone: e.target.value }))} />
              </div>
              <div>
                <Label>Clarity</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={voiceConfig.clarity}
                  onChange={(e) => setVoiceConfig((prev) => ({ ...prev, clarity: Number(e.target.value) || 1 }))}
                />
              </div>
              <div className="md:col-span-2 lg:col-span-5 flex justify-end">
                <Button onClick={() => saveVoiceConfigMutation.mutate()} disabled={saveVoiceConfigMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Voice Config
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Scenario Simulation Engine</CardTitle>
              <CardDescription>Telephony-free test calls with controlled personas and sample contacts</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Scenario</Label>
                <Select value={scenarioId} onValueChange={setScenarioId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(simulationOptionsQuery.data?.scenarios || []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Persona</Label>
                <Select value={personaId} onValueChange={setPersonaId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(simulationOptionsQuery.data?.personas || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Campaign</Label>
                <Select value={campaignId} onValueChange={setCampaignId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(sampleDataQuery.data?.campaigns || []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(sampleDataQuery.data?.accounts || []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Contact</Label>
                <Select value={contactId} onValueChange={setContactId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(sampleDataQuery.data?.contacts || []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} — {c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Simulation Input</Label>
                <Textarea value={simulationInput} onChange={(e) => setSimulationInput(e.target.value)} className="min-h-[100px]" />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={() => simulationMutation.mutate()} disabled={simulationMutation.isPending}>
                  <Play className="h-4 w-4 mr-2" />
                  Run Simulation
                </Button>
              </div>
            </CardContent>
          </Card>

          {simulationMutation.data && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Simulation Result</CardTitle>
                <CardDescription>Transcript preview and analysis output</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <pre className="text-xs bg-muted p-3 rounded max-h-[260px] overflow-auto">{JSON.stringify(simulationMutation.data, null, 2)}</pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="versions" className="space-y-4">
          {/* Voice trainers: Submit for Approval | Admins: Direct publish + Approval Queue */}
          {isVoiceTrainer ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4" /> Submit Changes for Admin Approval</CardTitle>
                <CardDescription>Your changes will be reviewed by an administrator before being published to production.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={publishNote}
                  onChange={(e) => setPublishNote(e.target.value)}
                  placeholder="Describe your changes (required)"
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => requestPublishMutation.mutate()}
                    disabled={requestPublishMutation.isPending || !publishNote.trim() || pendingRequests.length > 0}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {pendingRequests.length > 0 ? 'Approval Pending...' : 'Submit for Approval'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><GitBranch className="h-4 w-4" /> Draft → Publish Governance</CardTitle>
                <CardDescription>Promote tested draft to unified production version</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input value={publishNote} onChange={(e) => setPublishNote(e.target.value)} placeholder="Approval / publish note" />
                <div className="flex justify-end">
                  <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
                    <Upload className="h-4 w-4 mr-2" />
                    Publish Draft to Production
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Approval Queue — visible to admins when there are pending requests */}
          {isAdmin && pendingRequests.length > 0 && (
            <Card className="border-amber-500/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Pending Approval Requests
                  <Badge variant="secondary" className="ml-1">{pendingRequests.length}</Badge>
                </CardTitle>
                <CardDescription>Voice trainers have submitted changes for your review</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium">{request.note}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Draft v{request.draftVersion} · {request.sectionChanges.length} section{request.sectionChanges.length !== 1 ? 's' : ''} changed · {new Date(request.requestedAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-amber-600 border-amber-400">Pending</Badge>
                    </div>

                    {/* Section change preview */}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View changes</summary>
                      <div className="mt-2 space-y-2">
                        {request.sectionChanges.map((change) => (
                          <div key={change.sectionId} className="border rounded p-2">
                            <p className="font-medium mb-1">{change.name}</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-muted-foreground mb-1">Before:</p>
                                <pre className="bg-red-50 dark:bg-red-950/20 p-2 rounded max-h-[120px] overflow-auto whitespace-pre-wrap">{change.oldContent.slice(0, 500)}{change.oldContent.length > 500 ? '...' : ''}</pre>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">After:</p>
                                <pre className="bg-green-50 dark:bg-green-950/20 p-2 rounded max-h-[120px] overflow-auto whitespace-pre-wrap">{change.newContent.slice(0, 500)}{change.newContent.length > 500 ? '...' : ''}</pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>

                    {/* Approve / Reject actions */}
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Optional review note"
                          value={approvalReviewNote}
                          onChange={(e) => setApprovalReviewNote(e.target.value)}
                          className="text-xs"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => approveRequestMutation.mutate(request.id)}
                        disabled={approveRequestMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        Approve & Publish
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          const reason = rejectionNote || prompt('Rejection reason (required):');
                          if (reason) {
                            setRejectionNote(reason);
                            rejectRequestMutation.mutate(request.id);
                          }
                        }}
                        disabled={rejectRequestMutation.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Publish request status for voice trainers */}
          {isVoiceTrainer && (publishRequestsQuery.data?.requests || []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your Publish Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[300px] overflow-auto">
                {(publishRequestsQuery.data?.requests || []).map((request) => (
                  <div key={request.id} className="border rounded p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{request.note}</span>
                      <Badge
                        variant={request.status === 'approved' ? 'default' : request.status === 'rejected' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {request.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                        {request.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                        {request.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                        {request.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1">
                      Draft v{request.draftVersion} · {request.sectionChanges.length} changes · {new Date(request.requestedAt).toLocaleString()}
                    </p>
                    {request.reviewNote && (
                      <p className="mt-1 text-muted-foreground italic">
                        Admin feedback: {request.reviewNote}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Draft History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[360px] overflow-auto">
                {(versionsQuery.data?.draft?.history || []).map((entry) => (
                  <div key={entry.version} className="border rounded p-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium">Draft v{entry.version}</span>
                      <span>{new Date(entry.savedAt).toLocaleString()}</span>
                    </div>
                    <p className="text-muted-foreground mt-1">{entry.summary}</p>
                    {!isVoiceTrainer && (
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => rollbackMutation.mutate(entry.version)}>
                          Restore
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Publish History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[360px] overflow-auto">
                {(versionsQuery.data?.publishHistory || []).map((entry, idx) => (
                  <div key={`${entry.publishedVersion}-${idx}`} className="border rounded p-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium">Published {entry.publishedVersion}</span>
                      <span>{new Date(entry.publishedAt).toLocaleString()}</span>
                    </div>
                    <p className="text-muted-foreground mt-1">{entry.note}</p>
                    <p className="text-muted-foreground">Changes: {entry.sectionChanges}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Controlled Training Dataset</CardTitle>
              <CardDescription>Safe, non-sensitive records for QA and prompt refinement</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="border rounded p-3">
                  <div className="font-semibold">Campaigns</div>
                  <div className="text-muted-foreground text-xs">{(sampleDataQuery.data?.campaigns || []).length} sample campaigns</div>
                </div>
                <div className="border rounded p-3">
                  <div className="font-semibold">Accounts</div>
                  <div className="text-muted-foreground text-xs">{(sampleDataQuery.data?.accounts || []).length} sample accounts</div>
                </div>
                <div className="border rounded p-3">
                  <div className="font-semibold">Contacts</div>
                  <div className="text-muted-foreground text-xs">{(sampleDataQuery.data?.contacts || []).length} sample contacts</div>
                </div>
              </div>
              <pre className="text-xs bg-muted p-3 rounded mt-4 max-h-[320px] overflow-auto">{JSON.stringify(sampleDataQuery.data, null, 2)}</pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
