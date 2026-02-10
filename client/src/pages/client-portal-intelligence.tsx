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
  Palette,
  Shield,
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
  branding?: {
    tone?: string;
    voice?: string;
    keywords?: string[];
    communicationStyle?: string;
    forbiddenTerms?: string[];
  };
  compliance?: {
    certifications?: string[];
    dataResidency?: string;
    recordingConsent?: string;
    disclaimerText?: string;
  };
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
      <div className="max-w-7xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Organization Intelligence</h1>
            <p className="text-muted-foreground text-lg">
              AI-powered insights about your organization for smarter campaign execution
            </p>
          </div>
          {org && (
            <div className="flex items-center gap-2">
               <span className="text-xs text-muted-foreground">
                    Last updated: {org.updatedAt ? new Date(org.updatedAt).toLocaleDateString() : 'Never'}
               </span>
              <Button onClick={() => refetch()} variant="outline" size="icon" className="h-9 w-9" title="Refresh Data">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Analysis Progress */}
        {analysisProgress && (
           <div className="animate-in fade-in zoom-in-95 duration-300">
             <AnalysisProgressPanel progress={analysisProgress} />
           </div>
        )}

        {/* No Organization State */}
        {!org && !showCreateForm && (
          <Card className="border-dashed border-2 shadow-sm bg-muted/10">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
              <div className="bg-primary/10 p-4 rounded-full">
                <Building2 className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-xl font-semibold">No Organization Profile Found</h3>
                <p className="text-muted-foreground">
                  Create your organization profile to unlock AI-powered intelligence and better campaign targeting.
                </p>
              </div>
              <Button onClick={() => setShowCreateForm(true)} size="lg" className="mt-4">
                <Sparkles className="h-4 w-4 mr-2" />
                Create Organization Profile
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Create Organization Form */}
        {showCreateForm && (
          <Card className="max-w-lg mx-auto border-primary/20 shadow-lg">
            <CardHeader>
              <CardTitle>Create Organization Profile</CardTitle>
              <CardDescription>Enter your company details to get started</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Organization Name *</Label>
                <Input
                  placeholder="Your Company Name"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Website Domain</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="example.com"
                    value={newOrgDomain}
                    onChange={(e) => setNewOrgDomain(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
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
          <div className="space-y-8">
            {/* Intelligence Tabs */}
            <Tabs defaultValue="overview" className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <TabsList className="grid w-full grid-cols-6 lg:w-[900px] h-12 p-1 bg-muted/50 rounded-lg">
                  <TabsTrigger value="overview" className="rounded-md data-[state=active]:shadow-sm">Identity</TabsTrigger>
                  <TabsTrigger value="branding" className="rounded-md data-[state=active]:shadow-sm">Branding</TabsTrigger>
                  <TabsTrigger value="offerings" className="rounded-md data-[state=active]:shadow-sm">Offerings</TabsTrigger>
                  <TabsTrigger value="icp" className="rounded-md data-[state=active]:shadow-sm">ICP & Market</TabsTrigger>
                  <TabsTrigger value="positioning" className="rounded-md data-[state=active]:shadow-sm">Positioning</TabsTrigger>
                  <TabsTrigger value="compliance" className="rounded-md data-[state=active]:shadow-sm">Compliance</TabsTrigger>
                </TabsList>

                {/* Settings / Deep Analysis Button */}
                <Tabs value="settings" className="w-auto"> 
                   <TabsList className="bg-transparent p-0">
                      <TabsTrigger value="settings" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none p-0">
                         <Button variant="outline" size="sm" className="gap-2">
                            <Settings className="h-4 w-4" />
                            Settings & Analysis
                         </Button>
                      </TabsTrigger>
                   </TabsList>
                   
                   <TabsContent value="settings" className="absolute right-0 top-12 z-50 w-[400px] bg-card border rounded-xl shadow-xl p-4 mt-2">
                       <div className="space-y-4">
                          <h3 className="font-semibold flex items-center gap-2">
                             <Sparkles className="h-4 w-4 text-primary" />
                             Analyze Your Organization
                          </h3>
                          <div className="space-y-3">
                              <p className="text-xs text-muted-foreground">
                                Run multi-model AI analysis to gather comprehensive intelligence.
                              </p>
                              <div className="flex gap-2">
                                <Input 
                                  placeholder={org.domain || "example.com"} 
                                  value={domain}
                                  onChange={(e) => setDomain(e.target.value)}
                                  className="h-9 text-sm"
                                />
                                <Button 
                                  size="sm" 
                                  onClick={runDeepAnalysis}
                                  disabled={isAnalyzing}
                                >
                                  {isAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Analyze"}
                                </Button>
                              </div>
                          </div>
                          
                          {analysisProgress && <AnalysisProgressPanel progress={analysisProgress} />}
                       </div>
                   </TabsContent>
                </Tabs>
              </div>

              {/* Overview Tab (Renamed Identity) */}
              <TabsContent value="overview" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      Organization Identity
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-6 md:grid-cols-2">
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

              {/* Branding Tab */}
              <TabsContent value="branding" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Palette className="h-5 w-5 text-primary" />
                      Branding & Voice
                    </CardTitle>
                    <CardDescription>
                      Define how your AI agents should speak and represent your brand
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-6 md:grid-cols-2">
                    <IntelligenceField
                      label="Tone of Voice"
                      value={org.branding?.tone}
                      placeholder="e.g. Professional, Friendly, Authoritative"
                      icon={MessageSquare}
                      onSave={(value) => updateMutation.mutate({ branding: { ...org.branding, tone: value } })}
                    />
                    <IntelligenceField
                      label="Communication Style"
                      value={org.branding?.communicationStyle}
                      placeholder="e.g. Concise, Detailed, Storytelling"
                      icon={MessageSquare}
                      onSave={(value) => updateMutation.mutate({ branding: { ...org.branding, communicationStyle: value } })}
                    />
                    <div className="md:col-span-2">
                      <IntelligenceField
                        label="Brand Keywords"
                        value={org.branding?.keywords}
                        multiline
                        placeholder="Comma-separated keywords to emphasize (e.g. innovative, reliable, fast)"
                        icon={Brain}
                        onSave={(value) => updateMutation.mutate({ branding: { ...org.branding, keywords: value.split(',').map(s => s.trim()) } })}
                      />
                    </div>
                     <div className="md:col-span-2">
                      <IntelligenceField
                        label="Forbidden Terms"
                        value={org.branding?.forbiddenTerms}
                        multiline
                        placeholder="Comma-separated terms to avoid"
                        icon={AlertCircle}
                        onSave={(value) => updateMutation.mutate({ branding: { ...org.branding, forbiddenTerms: value.split(',').map(s => s.trim()) } })}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Compliance Tab */}
              <TabsContent value="compliance" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Compliance & Governance
                    </CardTitle>
                    <CardDescription>
                      Manage regulatory requirements, data residency, and compliance settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <IntelligenceField
                        label="Certifications"
                        value={org.compliance?.certifications}
                        multiline
                        placeholder="Comma-separated certifications (e.g. SOC2, HIPAA, GDPR)"
                        icon={Award}
                        onSave={(value) => updateMutation.mutate({ compliance: { ...org.compliance, certifications: value.split(',').map(s => s.trim()) } })}
                      />
                    </div>
                    <IntelligenceField
                      label="Data Residency"
                      value={org.compliance?.dataResidency}
                      placeholder="e.g. US, EU, Global"
                      icon={Globe}
                      onSave={(value) => updateMutation.mutate({ compliance: { ...org.compliance, dataResidency: value } })}
                    />
                     <IntelligenceField
                      label="Recording Consent Policy"
                      value={org.compliance?.recordingConsent}
                      placeholder="e.g. One-party, Two-party, Required"
                      icon={Phone}
                      onSave={(value) => updateMutation.mutate({ compliance: { ...org.compliance, recordingConsent: value } })}
                    />
                    <div className="md:col-span-2">
                      <IntelligenceField
                        label="Call Disclaimer Text"
                        value={org.compliance?.disclaimerText}
                        multiline
                        placeholder="Standard disclaimer to be read during calls"
                        icon={AlertCircle}
                        onSave={(value) => updateMutation.mutate({ compliance: { ...org.compliance, disclaimerText: value } })}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Offerings Tab */}
              <TabsContent value="offerings" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                <div className="grid lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-3">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Award className="h-5 w-5 text-primary" />
                          Products & Services
                        </CardTitle>
                        <CardDescription>
                          What your organization offers and the problems you solve
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <IntelligenceField
                          label="Core Products/Services"
                          value={org.offerings?.coreProducts}
                          multiline
                          onSave={(value) => updateMutation.mutate({ offerings: { ...org.offerings, coreProducts: value.split(',').map(s => s.trim()) } })}
                        />
                         <div className="grid md:grid-cols-2 gap-6">
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
                        </div>
                        <IntelligenceField
                          label="Key Differentiators"
                          value={org.offerings?.differentiators}
                          multiline
                          onSave={(value) => updateMutation.mutate({ offerings: { ...org.offerings, differentiators: value.split(',').map(s => s.trim()) } })}
                        />
                      </CardContent>
                    </Card>
                </div>
              </TabsContent>

              {/* Target Market Tab */}
              <TabsContent value="icp" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-primary" />
                      Ideal Customer Profile
                    </CardTitle>
                    <CardDescription>
                      Your target market and buyer personas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
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
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                        <Users className="h-3 w-3" />
                        Target Personas
                      </Label>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {org.icp?.personas?.map((persona, idx) => (
                          <div key={idx} className="p-4 rounded-lg bg-muted/30 border shadow-sm">
                            <p className="font-semibold text-sm flex items-center gap-2">
                                <Users className="w-3 h-3 text-primary"/> {persona.title}
                            </p>
                            {persona.painPoints && persona.painPoints.length > 0 && (
                              <div className="mt-3 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Pain Points:</span>
                                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                 {persona.painPoints.map((pp, i) => <li key={i}>{pp}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        )) || (
                          <p className="text-sm text-muted-foreground italic p-2 bg-muted/50 rounded-md col-span-full">
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
              <TabsContent value="positioning" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                <div className="grid lg:grid-cols-2 gap-6">
                    <Card className="bg-primary/5 border-primary/20">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Lightbulb className="h-5 w-5 text-primary" />
                          Market Positioning
                        </CardTitle>
                        <CardDescription>
                          How you differentiate from competitors
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
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
                          label="Why Choose Us"
                          value={org.positioning?.whyUs}
                          multiline
                          onSave={(value) => updateMutation.mutate({ positioning: { ...org.positioning, whyUs: value.split(',').map(s => s.trim()) } })}
                        />
                      </CardContent>
                    </Card>
                    
                     <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-primary" />
                          Competitive Landscape
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <IntelligenceField
                          label="Primary Competitors"
                          value={org.positioning?.competitors}
                          onSave={(value) => updateMutation.mutate({ positioning: { ...org.positioning, competitors: value.split(',').map(s => s.trim()) } })}
                        />
                      </CardContent>
                    </Card>
                </div>
              </TabsContent>

              {/* Outreach Tab */}
              <TabsContent value="outreach" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                <div className="grid lg:grid-cols-2 gap-6">
                    <Card className="h-full">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MessageSquare className="h-5 w-5 text-primary" />
                          Outreach Strategy
                        </CardTitle>
                        <CardDescription>
                          Messaging angles and scripts
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-3">
                            <Mail className="h-3 w-3" />
                            Email Angles
                          </Label>
                          <div className="space-y-3">
                            {org.outreach?.emailAngles?.map((angle, idx) => (
                              <div key={idx} className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 text-sm">
                                {angle}
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
                          <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-3">
                            <Phone className="h-3 w-3" />
                            Call Openers
                          </Label>
                          <div className="space-y-3">
                            {org.outreach?.callOpeners?.map((opener, idx) => (
                              <div key={idx} className="p-3 rounded-lg bg-green-50/50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/50 text-sm">
                                {opener}
                              </div>
                            )) || (
                              <p className="text-sm text-muted-foreground italic p-2 bg-muted/50 rounded-md">
                                Run deep analysis to generate call openers
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="h-full">
                         <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <AlertCircle className="h-5 w-5 text-primary" />
                              Objection Handling
                            </CardTitle>
                         </CardHeader>
                         <CardContent>
                            {org.outreach?.objectionHandlers && org.outreach.objectionHandlers.length > 0 ? (
                                <div className="space-y-4">
                                    {org.outreach.objectionHandlers.map((handler, idx) => (
                                      <div key={idx} className="p-4 rounded-lg bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/50">
                                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                                          "{handler.objection}"
                                        </p>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{handler.response}</p>
                                      </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground italic">
                                    No objection handlers available.
                                </p>
                            )}
                         </CardContent>
                    </Card>
                </div>
              </TabsContent>
            </Tabs>

            {/* Linked Campaigns */}
            {data?.campaigns && data.campaigns.length > 0 && (
              <div className="pt-8">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-500" />
                      Active Campaigns Using This Intelligence
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {data.campaigns.map((campaign) => (
                      <Card key={campaign.id} className="w-64 border shadow-sm hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                              <div className="font-medium truncate" title={campaign.name}>{campaign.name}</div>
                              <div className="flex items-center gap-2 mt-2">
                                  <Badge variant="outline" className={cn(
                                      "capitalize",
                                      campaign.status === "active" ? "text-green-600 bg-green-50 border-green-200" :
                                      campaign.status === "paused" ? "text-amber-600 bg-amber-50 border-amber-200" : ""
                                  )}>
                                      {campaign.status}
                                  </Badge>
                              </div>
                          </CardContent>
                      </Card>
                    ))}
                  </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ClientPortalLayout>
  );
}
