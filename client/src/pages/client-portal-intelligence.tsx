/**
 * Client Portal Organization Intelligence Page
 *
 * Allows clients to analyze and manage their organization's intelligence profile
 * with deep multi-model AI research capabilities.
 */
import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClientPortalLayout } from '@/components/client-portal/layout/client-portal-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Building2,
  Globe,
  Search,
  Sparkles,
  Loader2,
  CheckCircle2,
  Target,
  Users,
  MessageSquare,
  Phone,
  Mail,
  TrendingUp,
  Edit2,
  Save,
  RefreshCw,
  AlertCircle,
  Zap,
  Brain,
  Lightbulb,
  Award,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const getToken = () => localStorage.getItem('clientPortalToken');

interface OrganizationIntelligence {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  logoUrl?: string;
  identity?: {
    legalName?: string;
    description?: string;
    industry?: string;
    employees?: string;
    regions?: string[];
    foundedYear?: number;
  };
  offerings?: {
    coreProducts?: string[];
    useCases?: string[];
    problemsSolved?: string[];
    differentiators?: string[];
  };
  icp?: {
    industries?: string[];
    personas?: Array<{ title: string; painPoints?: string[]; goals?: string[] }>;
    objections?: string[];
    companySize?: string;
  };
  positioning?: {
    oneLiner?: string;
    valueProposition?: string;
    competitors?: string[];
    whyUs?: string[];
  };
  outreach?: {
    emailAngles?: string[];
    callOpeners?: string[];
    objectionHandlers?: Array<{ objection: string; response: string }>;
  };
  updatedAt?: string;
}

interface AnalysisProgress {
  phase: string;
  message: string;
  progress: number;
}

async function fetchOrgIntelligence(): Promise<{
  organization: OrganizationIntelligence | null;
  campaigns: any[];
  isPrimary: boolean;
}> {
  const res = await fetch('/api/client-portal/settings/organization-intelligence', {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed to fetch organization intelligence');
  return res.json();
}

async function updateOrgIntelligence(data: Partial<OrganizationIntelligence>): Promise<any> {
  const res = await fetch('/api/client-portal/settings/organization-intelligence', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update organization intelligence');
  return res.json();
}

async function createOrganization(data: { name: string; domain?: string; industry?: string }): Promise<any> {
  const res = await fetch('/api/client-portal/settings/organization-intelligence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create organization');
  return res.json();
}

function IntelligenceField({
  label,
  value,
  multiline = false,
  onSave,
  icon: Icon,
}: {
  label: string;
  value?: string | string[];
  multiline?: boolean;
  onSave?: (value: string) => void;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(
    Array.isArray(value) ? value.join(', ') : value || ''
  );

  const handleSave = () => {
    if (onSave) onSave(tempValue);
    setIsEditing(false);
  };

  const displayValue = Array.isArray(value) ? value.join(', ') : value;

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </Label>
        {onSave && !isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setIsEditing(true)}
          >
            <Edit2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      {isEditing ? (
        <div className="space-y-2">
          {multiline ? (
            <Textarea
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              className="min-h-[80px] text-sm"
            />
          ) : (
            <Input
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              className="text-sm"
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className={cn(
          "text-sm p-2 rounded-md bg-muted/50 min-h-[36px]",
          !displayValue && "text-muted-foreground italic"
        )}>
          {displayValue || 'Not set'}
        </p>
      )}
    </div>
  );
}

function AnalysisProgressPanel({ progress }: { progress: AnalysisProgress | null }) {
  if (!progress) return null;

  const phaseIcons: Record<string, React.ReactNode> = {
    init: <Zap className="h-4 w-4 text-blue-500" />,
    research: <Search className="h-4 w-4 text-purple-500" />,
    analysis: <Brain className="h-4 w-4 text-orange-500" />,
    synthesis: <Lightbulb className="h-4 w-4 text-yellow-500" />,
    save: <Save className="h-4 w-4 text-green-500" />,
    complete: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-4">
        <div className="flex items-center gap-3 mb-3">
          {phaseIcons[progress.phase] || <Loader2 className="h-4 w-4 animate-spin" />}
          <span className="text-sm font-medium">{progress.message}</span>
        </div>
        <Progress value={progress.progress} className="h-2" />
        <p className="text-xs text-muted-foreground mt-2 text-right">{progress.progress}%</p>
      </CardContent>
    </Card>
  );
}

export default function ClientPortalIntelligence() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDomain, setNewOrgDomain] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['client-org-intelligence'],
    queryFn: fetchOrgIntelligence,
    staleTime: 5 * 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: updateOrgIntelligence,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-org-intelligence'] });
      toast({ title: 'Intelligence updated', description: 'Your organization profile has been updated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    },
  });

  const createMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-org-intelligence'] });
      toast({ title: 'Organization created', description: 'Your organization profile has been created.' });
      setShowCreateForm(false);
      setNewOrgName('');
      setNewOrgDomain('');
    },
    onError: (error: Error) => {
      toast({ title: 'Creation failed', description: error.message, variant: 'destructive' });
    },
  });

  const runDeepAnalysis = useCallback(async () => {
    const domainToAnalyze = domain || data?.organization?.domain;
    if (!domainToAnalyze) {
      toast({ title: 'Domain required', description: 'Please enter a domain to analyze.', variant: 'destructive' });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress({ phase: 'init', message: 'Initializing...', progress: 0 });

    try {
      const response = await fetch('/api/client-portal/settings/organization-intelligence/analyze-deep', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ domain: domainToAnalyze }),
      });

      if (!response.ok) {
        throw new Error('Failed to start analysis');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'progress') {
                setAnalysisProgress({
                  phase: event.phase,
                  message: event.message,
                  progress: event.progress,
                });
              } else if (event.type === 'complete') {
                setAnalysisProgress({ phase: 'complete', message: 'Analysis complete!', progress: 100 });
                queryClient.invalidateQueries({ queryKey: ['client-org-intelligence'] });
                toast({
                  title: 'Deep analysis complete',
                  description: `Analyzed with ${event.data.meta.modelCount} AI models and ${event.data.meta.researchSources} sources.`,
                });
              } else if (event.type === 'error') {
                throw new Error(event.error);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error: any) {
      toast({ title: 'Analysis failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => setAnalysisProgress(null), 3000);
    }
  }, [domain, data?.organization?.domain, queryClient, toast]);

  const org = data?.organization;

  if (isLoading) {
    return (
      <ClientPortalLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ClientPortalLayout>
    );
  }

  return (
    <ClientPortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              Organization Intelligence
            </h1>
            <p className="text-muted-foreground mt-1">
              AI-powered insights about your organization for smarter campaign execution
            </p>
          </div>
          {org && (
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          )}
        </div>

        {/* Analysis Progress */}
        {analysisProgress && <AnalysisProgressPanel progress={analysisProgress} />}

        {/* No Organization State */}
        {!org && !showCreateForm && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Set Up Your Organization Profile
              </CardTitle>
              <CardDescription>
                Create your organization profile to unlock AI-powered intelligence and better campaign targeting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setShowCreateForm(true)}>
                <Building2 className="h-4 w-4 mr-2" />
                Create Organization Profile
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Create Organization Form */}
        {showCreateForm && (
          <Card>
            <CardHeader>
              <CardTitle>Create Organization Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Organization Name *</Label>
                <Input
                  placeholder="Your Company Name"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                />
              </div>
              <div>
                <Label>Website Domain</Label>
                <Input
                  placeholder="example.com"
                  value={newOrgDomain}
                  onChange={(e) => setNewOrgDomain(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate({ name: newOrgName, domain: newOrgDomain })}
                disabled={!newOrgName || createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Profile
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Organization Intelligence Content */}
        {org && (
          <>
            {/* Deep Analysis Card */}
            <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  AI Deep Research
                </CardTitle>
                <CardDescription>
                  Run multi-model AI analysis to gather comprehensive intelligence about your organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder={org.domain || "Enter your website domain (e.g., example.com)"}
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      disabled={isAnalyzing}
                    />
                  </div>
                  <Button
                    onClick={runDeepAnalysis}
                    disabled={isAnalyzing}
                    className="bg-gradient-to-r from-primary to-primary/80"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Run Deep Analysis
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Deep analysis uses multiple AI models (OpenAI, Gemini, Claude) to research your company from the web and synthesize comprehensive intelligence.
                </p>
              </CardContent>
            </Card>

            {/* Intelligence Tabs */}
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="grid w-full grid-cols-5 lg:w-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="offerings">Offerings</TabsTrigger>
                <TabsTrigger value="icp">Target Market</TabsTrigger>
                <TabsTrigger value="positioning">Positioning</TabsTrigger>
                <TabsTrigger value="outreach">Outreach</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Organization Identity
                    </CardTitle>
                    {org.updatedAt && (
                      <CardDescription>
                        Last updated: {new Date(org.updatedAt).toLocaleDateString()}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <IntelligenceField
                      label="Legal Name"
                      value={org.identity?.legalName || org.name}
                      icon={Building2}
                      onSave={(value) => updateMutation.mutate({ identity: { ...org.identity, legalName: value } })}
                    />
                    <IntelligenceField
                      label="Domain"
                      value={org.domain}
                      icon={Globe}
                    />
                    <div className="md:col-span-2">
                      <IntelligenceField
                        label="Description"
                        value={org.identity?.description}
                        multiline
                        onSave={(value) => updateMutation.mutate({ identity: { ...org.identity, description: value } })}
                      />
                    </div>
                    <IntelligenceField
                      label="Industry"
                      value={org.identity?.industry || org.industry}
                      icon={TrendingUp}
                      onSave={(value) => updateMutation.mutate({ identity: { ...org.identity, industry: value } })}
                    />
                    <IntelligenceField
                      label="Company Size"
                      value={org.identity?.employees}
                      icon={Users}
                      onSave={(value) => updateMutation.mutate({ identity: { ...org.identity, employees: value } })}
                    />
                    <IntelligenceField
                      label="Regions"
                      value={org.identity?.regions}
                      icon={Globe}
                      onSave={(value) => updateMutation.mutate({ identity: { ...org.identity, regions: value.split(',').map(s => s.trim()) } })}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Offerings Tab */}
              <TabsContent value="offerings">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5" />
                      Products & Services
                    </CardTitle>
                    <CardDescription>
                      What your organization offers and the problems you solve
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <IntelligenceField
                      label="Core Products/Services"
                      value={org.offerings?.coreProducts}
                      multiline
                      onSave={(value) => updateMutation.mutate({ offerings: { ...org.offerings, coreProducts: value.split(',').map(s => s.trim()) } })}
                    />
                    <IntelligenceField
                      label="Key Use Cases"
                      value={org.offerings?.useCases}
                      multiline
                      onSave={(value) => updateMutation.mutate({ offerings: { ...org.offerings, useCases: value.split(',').map(s => s.trim()) } })}
                    />
                    <IntelligenceField
                      label="Problems Solved"
                      value={org.offerings?.problemsSolved}
                      multiline
                      onSave={(value) => updateMutation.mutate({ offerings: { ...org.offerings, problemsSolved: value.split(',').map(s => s.trim()) } })}
                    />
                    <IntelligenceField
                      label="Key Differentiators"
                      value={org.offerings?.differentiators}
                      multiline
                      onSave={(value) => updateMutation.mutate({ offerings: { ...org.offerings, differentiators: value.split(',').map(s => s.trim()) } })}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Target Market Tab */}
              <TabsContent value="icp">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Ideal Customer Profile
                    </CardTitle>
                    <CardDescription>
                      Your target market and buyer personas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <IntelligenceField
                      label="Target Industries"
                      value={org.icp?.industries}
                      onSave={(value) => updateMutation.mutate({ icp: { ...org.icp, industries: value.split(',').map(s => s.trim()) } })}
                    />
                    <IntelligenceField
                      label="Target Company Size"
                      value={org.icp?.companySize}
                      onSave={(value) => updateMutation.mutate({ icp: { ...org.icp, companySize: value } })}
                    />
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                        <Users className="h-3 w-3" />
                        Target Personas
                      </Label>
                      <div className="space-y-2">
                        {org.icp?.personas?.map((persona, idx) => (
                          <div key={idx} className="p-3 rounded-md bg-muted/50">
                            <p className="font-medium text-sm">{persona.title}</p>
                            {persona.painPoints && persona.painPoints.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Pain Points: {persona.painPoints.join(', ')}
                              </p>
                            )}
                          </div>
                        )) || (
                          <p className="text-sm text-muted-foreground italic p-2 bg-muted/50 rounded-md">
                            No personas defined
                          </p>
                        )}
                      </div>
                    </div>
                    <IntelligenceField
                      label="Common Objections"
                      value={org.icp?.objections}
                      multiline
                      onSave={(value) => updateMutation.mutate({ icp: { ...org.icp, objections: value.split(',').map(s => s.trim()) } })}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Positioning Tab */}
              <TabsContent value="positioning">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5" />
                      Market Positioning
                    </CardTitle>
                    <CardDescription>
                      How you differentiate from competitors
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <IntelligenceField
                      label="One-Liner Pitch"
                      value={org.positioning?.oneLiner}
                      onSave={(value) => updateMutation.mutate({ positioning: { ...org.positioning, oneLiner: value } })}
                    />
                    <IntelligenceField
                      label="Value Proposition"
                      value={org.positioning?.valueProposition}
                      multiline
                      onSave={(value) => updateMutation.mutate({ positioning: { ...org.positioning, valueProposition: value } })}
                    />
                    <IntelligenceField
                      label="Competitors"
                      value={org.positioning?.competitors}
                      onSave={(value) => updateMutation.mutate({ positioning: { ...org.positioning, competitors: value.split(',').map(s => s.trim()) } })}
                    />
                    <IntelligenceField
                      label="Why Choose Us"
                      value={org.positioning?.whyUs}
                      multiline
                      onSave={(value) => updateMutation.mutate({ positioning: { ...org.positioning, whyUs: value.split(',').map(s => s.trim()) } })}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Outreach Tab */}
              <TabsContent value="outreach">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Outreach Intelligence
                    </CardTitle>
                    <CardDescription>
                      AI-generated messaging angles and call scripts
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                        <Mail className="h-3 w-3" />
                        Email Angles
                      </Label>
                      <div className="space-y-2">
                        {org.outreach?.emailAngles?.map((angle, idx) => (
                          <div key={idx} className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
                            <p className="text-sm">{angle}</p>
                          </div>
                        )) || (
                          <p className="text-sm text-muted-foreground italic p-2 bg-muted/50 rounded-md">
                            Run deep analysis to generate email angles
                          </p>
                        )}
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                        <Phone className="h-3 w-3" />
                        Call Openers
                      </Label>
                      <div className="space-y-2">
                        {org.outreach?.callOpeners?.map((opener, idx) => (
                          <div key={idx} className="p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900">
                            <p className="text-sm">{opener}</p>
                          </div>
                        )) || (
                          <p className="text-sm text-muted-foreground italic p-2 bg-muted/50 rounded-md">
                            Run deep analysis to generate call openers
                          </p>
                        )}
                      </div>
                    </div>
                    {org.outreach?.objectionHandlers && org.outreach.objectionHandlers.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                            <AlertCircle className="h-3 w-3" />
                            Objection Handlers
                          </Label>
                          <div className="space-y-2">
                            {org.outreach.objectionHandlers.map((handler, idx) => (
                              <div key={idx} className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900">
                                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                  "{handler.objection}"
                                </p>
                                <p className="text-sm mt-1 text-muted-foreground">{handler.response}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Linked Campaigns */}
            {data?.campaigns && data.campaigns.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Linked Campaigns</CardTitle>
                  <CardDescription>
                    Campaigns using this organization's intelligence
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {data.campaigns.map((campaign) => (
                      <Badge key={campaign.id} variant="secondary">
                        {campaign.name}
                        <span className="ml-1 text-xs opacity-70">({campaign.status})</span>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ClientPortalLayout>
  );
}
