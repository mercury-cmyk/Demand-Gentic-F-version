/**
 * Client Portal Organization Intelligence Page
 *
 * Allows clients to analyze and manage their organization's intelligence profile
 * with deep multi-model AI research capabilities.
 */
import React, { useState, useRef, useCallback } from 'react';
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
  Calendar,
  Award,
  Palette,
  Shield,
  Image,
  Paintbrush,
  Trash2,
  Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { extractColorsFromImage } from '@/lib/color-extractor';

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
    primaryColor?: string;
    secondaryColor?: string;
  };
  compliance?: {
    certifications?: string[];
    dataResidency?: string;
    recordingConsent?: string;
    disclaimerText?: string;
  };
  events?: {
    upcoming?: string;
    strategy?: string;
  };
  forums?: {
    list?: string;
    engagement_strategy?: string;
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
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || 'Failed to create organization');
  }
  return json;
}

/**
 * Extract the display string from a value that may be:
 * - a plain string
 * - an array of strings
 * - an object like { value: "...", locked, source, status, confidence }
 * - an array of such objects
 * - deeply nested objects
 */
function resolveFieldValue(val: any): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    return val.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'value' in item) {
        // Handle nested: { value: { value: "...", ... } }
        const inner = item.value;
        if (inner && typeof inner === 'object' && 'value' in inner) return String(inner.value ?? '');
        return String(inner ?? '');
      }
      return String(item ?? '');
    }).filter(Boolean).join(', ');
  }
  if (typeof val === 'object' && 'value' in val) {
    const inner = val.value;
    // Handle nested: { value: { value: "...", ... } }
    if (inner && typeof inner === 'object' && 'value' in inner) return String(inner.value ?? '');
    // Handle: { value: [...] } — recurse for arrays
    if (Array.isArray(inner)) return resolveFieldValue(inner);
    return String(inner ?? '');
  }
  // Fallback: try JSON or empty
  try { return JSON.stringify(val); } catch { return ''; }
}

function IntelligenceField({
  label,
  value,
  multiline = false,
  onSave,
  icon: Icon,
  placeholder: _placeholder,
}: {
  label: string;
  value?: any;
  multiline?: boolean;
  onSave?: (value: string) => void;
  icon?: React.ComponentType<{ className?: string }>;
  placeholder?: string;
}) {
  const resolved = resolveFieldValue(value);
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(resolved);

  // Sync tempValue when the resolved value changes (e.g. after API refetch)
  React.useEffect(() => {
    if (!isEditing) {
      setTempValue(resolved);
    }
  }, [resolved, isEditing]);

  const handleSave = () => {
    if (onSave) onSave(tempValue);
    setIsEditing(false);
  };

  const displayValue = resolved;
  const placeholderText = _placeholder || 'Not set';

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
        <div className={cn(
          "text-sm p-2 rounded-md bg-muted/50 min-h-[36px]",
          !displayValue && "text-muted-foreground italic"
        )}>
          {String(displayValue || placeholderText)}
        </div>
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
  // Brand identity state
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [brandPrimaryColor, setBrandPrimaryColor] = useState('');
  const [brandSecondaryColor, setBrandSecondaryColor] = useState('');
  const [extractedColors, setExtractedColors] = useState<{ hex: string; percentage: number }[]>([]);
  const [isExtractingColors, setIsExtractingColors] = useState(false);
  const [brandDirty, setBrandDirty] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['client-org-intelligence'],
    queryFn: fetchOrgIntelligence,
    staleTime: 0, // Always fetch fresh data to avoid sync issues
    refetchOnWindowFocus: true,
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
      if (error.message.includes('Organization already linked')) {
        queryClient.invalidateQueries({ queryKey: ['client-org-intelligence'] });
        setShowCreateForm(false);
        toast({ title: 'Organization Linked', description: 'This organization is already linked. Loading profile...' });
      } else {
        toast({ title: 'Creation failed', description: error.message, variant: 'destructive' });
      }
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

  // Sync brand state from org data when it loads/changes
  React.useEffect(() => {
    if (org) {
      setBrandLogoUrl(resolveFieldValue(org.logoUrl) || '');
      setBrandPrimaryColor(resolveFieldValue(org.branding?.primaryColor) || '');
      setBrandSecondaryColor(resolveFieldValue(org.branding?.secondaryColor) || '');
      setBrandDirty(false);
    }
  }, [org?.logoUrl, org?.branding?.primaryColor, org?.branding?.secondaryColor]);

  const handleExtractColorsFromLogo = async () => {
    if (!brandLogoUrl) return;
    setIsExtractingColors(true);
    setExtractedColors([]);
    try {
      const colors = await extractColorsFromImage(brandLogoUrl, 6);
      setExtractedColors(colors.map((c) => ({ hex: c.hex, percentage: c.percentage })));
      if (colors.length > 0) {
        setBrandPrimaryColor(colors[0].hex);
        if (colors.length > 1) setBrandSecondaryColor(colors[1].hex);
        setBrandDirty(true);
      }
    } catch {
      toast({ title: 'Could not extract colors', description: 'Make sure the logo URL is accessible and points to an image (PNG, JPG, SVG).', variant: 'destructive' });
    } finally {
      setIsExtractingColors(false);
    }
  };

  const handleSaveBrandIdentity = () => {
    updateMutation.mutate({
      logoUrl: brandLogoUrl,
      branding: {
        ...(org?.branding || {}),
        primaryColor: brandPrimaryColor,
        secondaryColor: brandSecondaryColor,
      },
    } as any);
    setBrandDirty(false);
  };

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
                  <TabsTrigger value="overview" className="rounded-md data-[state=active]:shadow-sm">Identity & Branding</TabsTrigger>
                  <TabsTrigger value="offerings" className="rounded-md data-[state=active]:shadow-sm">Offerings</TabsTrigger>
                  <TabsTrigger value="icp" className="rounded-md data-[state=active]:shadow-sm">ICP & Market</TabsTrigger>
                  <TabsTrigger value="positioning" className="rounded-md data-[state=active]:shadow-sm">Positioning</TabsTrigger>
                  <TabsTrigger value="outreach" className="rounded-md data-[state=active]:shadow-sm">Outreach</TabsTrigger>
                  <TabsTrigger value="events" className="rounded-md data-[state=active]:shadow-sm">Events & Forums</TabsTrigger>
                </TabsList>

                {/* Deep Analysis Section */}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={org.domain || "example.com"}
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="h-9 text-sm w-48"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runDeepAnalysis}
                    disabled={isAnalyzing}
                    className="gap-2"
                  >
                    {isAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                  </Button>
                </div>
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

                <div className="py-4"></div>
                <div className="grid lg:grid-cols-3 gap-6">
                  {/* Brand Identity Card - Left column */}
                  <Card className="lg:col-span-1 border-primary/10 bg-gradient-to-b from-primary/[0.02] to-transparent">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Palette className="h-5 w-5 text-primary" />
                        Brand Identity
                      </CardTitle>
                      <CardDescription>
                        Visual identity and brand colors
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Logo Section */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Brand Logo</Label>
                        <div className="flex items-start gap-4">
                          <div className="shrink-0">
                            <div
                              className="h-20 w-20 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden"
                              style={{ borderColor: brandPrimaryColor || '#e2e8f0' }}
                            >
                              {brandLogoUrl ? (
                                <img
                                  src={brandLogoUrl}
                                  alt="Company logo"
                                  className="h-full w-full object-contain p-1"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              ) : (
                                <div className="text-center">
                                  <Building2 className="h-6 w-6 text-muted-foreground/40 mx-auto" />
                                  <span className="text-[9px] text-muted-foreground">No logo</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex-1 space-y-2">
                            <Label className="text-xs">Logo URL</Label>
                            <Input
                              placeholder="https://yourcompany.com/logo.png"
                              value={brandLogoUrl}
                              onChange={(e) => {
                                setBrandLogoUrl(e.target.value);
                                setExtractedColors([]);
                                setBrandDirty(true);
                              }}
                              className="text-xs h-8"
                            />
                            <div className="flex gap-1.5 flex-wrap">
                              {brandLogoUrl && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-[10px] h-6 px-2"
                                    onClick={handleExtractColorsFromLogo}
                                    disabled={isExtractingColors}
                                  >
                                    {isExtractingColors ? (
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                      <Sparkles className="h-3 w-3 mr-1" />
                                    )}
                                    Extract Colors
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50 h-6 px-2"
                                    onClick={() => {
                                      setBrandLogoUrl('');
                                      setExtractedColors([]);
                                      setBrandDirty(true);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Remove
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Extracted Colors */}
                      {extractedColors.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Colors from Logo</Label>
                          <div className="rounded-lg border bg-muted/30 p-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              {extractedColors.map((color, idx) => (
                                <button
                                  key={color.hex}
                                  className={`group relative h-8 w-8 rounded-lg border-2 transition-all hover:scale-110 ${
                                    brandPrimaryColor === color.hex ? 'ring-2 ring-offset-1 ring-primary border-primary' : 'border-transparent'
                                  }`}
                                  style={{ backgroundColor: color.hex }}
                                  onClick={() => {
                                    setBrandPrimaryColor(color.hex);
                                    setBrandDirty(true);
                                  }}
                                  title={`${color.hex} (${color.percentage}%)`}
                                >
                                  {idx === 0 && (
                                    <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary flex items-center justify-center">
                                      <Crown className="h-2 w-2 text-white" />
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                            <p className="text-[9px] text-muted-foreground mt-1.5">
                              Click to set as primary color
                            </p>
                          </div>
                        </div>
                      )}

                      <Separator />

                      {/* Color Pickers */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Brand Colors</Label>

                        {/* Primary Color */}
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Primary Color</Label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={brandPrimaryColor || '#3B82F6'}
                              onChange={(e) => { setBrandPrimaryColor(e.target.value); setBrandDirty(true); }}
                              className="h-9 w-12 rounded-lg border cursor-pointer"
                            />
                            <Input
                              value={brandPrimaryColor}
                              onChange={(e) => { setBrandPrimaryColor(e.target.value); setBrandDirty(true); }}
                              placeholder="#3B82F6"
                              className="font-mono text-xs h-8 max-w-[120px]"
                            />
                          </div>
                        </div>

                        {/* Secondary Color */}
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Secondary Color</Label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={brandSecondaryColor || '#8B5CF6'}
                              onChange={(e) => { setBrandSecondaryColor(e.target.value); setBrandDirty(true); }}
                              className="h-9 w-12 rounded-lg border cursor-pointer"
                            />
                            <Input
                              value={brandSecondaryColor}
                              onChange={(e) => { setBrandSecondaryColor(e.target.value); setBrandDirty(true); }}
                              placeholder="#8B5CF6"
                              className="font-mono text-xs h-8 max-w-[120px]"
                            />
                          </div>
                        </div>

                        {/* Quick Presets */}
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Quick Presets</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { color: '#3B82F6', name: 'Blue' },
                              { color: '#8B5CF6', name: 'Purple' },
                              { color: '#EC4899', name: 'Pink' },
                              { color: '#EF4444', name: 'Red' },
                              { color: '#F97316', name: 'Orange' },
                              { color: '#22C55E', name: 'Green' },
                              { color: '#14B8A6', name: 'Teal' },
                              { color: '#06B6D4', name: 'Cyan' },
                              { color: '#6366F1', name: 'Indigo' },
                              { color: '#1E293B', name: 'Dark' },
                            ].map((preset) => (
                              <button
                                key={preset.color}
                                className={`h-6 w-6 rounded-full border-2 transition-all hover:scale-110 ${
                                  brandPrimaryColor === preset.color ? 'ring-2 ring-offset-1 ring-primary' : 'border-transparent'
                                }`}
                                style={{ backgroundColor: preset.color }}
                                onClick={() => { setBrandPrimaryColor(preset.color); setBrandDirty(true); }}
                                title={preset.name}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Preview */}
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Preview</Label>
                        <div className="rounded-lg border p-3 space-y-2.5">
                          <div className="flex items-center gap-2">
                            {brandLogoUrl ? (
                              <img src={brandLogoUrl} alt="Logo" className="h-6 w-6 object-contain" />
                            ) : (
                              <div className="h-6 w-6 rounded-md flex items-center justify-center" style={{ backgroundColor: brandPrimaryColor || '#3B82F6' }}>
                                <span className="text-white font-bold text-[9px]">
                                  {(org.name || 'Co')[0]?.toUpperCase()}
                                </span>
                              </div>
                            )}
                            <span className="font-semibold text-xs">{org.name || 'Your Company'}</span>
                          </div>
                          <div className="flex gap-2">
                            <div
                              className="h-6 px-3 rounded-md flex items-center justify-center text-white text-[10px] font-medium"
                              style={{ backgroundColor: brandPrimaryColor || '#3B82F6' }}
                            >
                              Primary
                            </div>
                            <div
                              className="h-6 px-3 rounded-md flex items-center justify-center text-white text-[10px] font-medium"
                              style={{ backgroundColor: brandSecondaryColor || '#8B5CF6' }}
                            >
                              Secondary
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <div className="h-1 flex-1 rounded-full" style={{ backgroundColor: brandPrimaryColor || '#3B82F6' }} />
                            <div className="h-1 flex-1 rounded-full" style={{ backgroundColor: brandSecondaryColor || '#8B5CF6' }} />
                          </div>
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        onClick={handleSaveBrandIdentity}
                        disabled={updateMutation.isPending || !brandDirty}
                      >
                        {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save Brand Identity
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Voice & Communication Card - Right 2 columns */}
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Palette className="h-5 w-5 text-primary" />
                        Voice & Communication
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
                </div>
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
                        {(Array.isArray(org.icp?.personas) && org.icp.personas.length > 0) ? (
                          org.icp.personas.map((persona: any, idx: number) => {
                          const personaTitle = resolveFieldValue(persona?.title) || resolveFieldValue(persona);
                          const painPoints = Array.isArray(persona?.painPoints) ? persona.painPoints : [];
                          return (
                            <div key={idx} className="p-4 rounded-lg bg-muted/30 border shadow-sm">
                              <p className="font-semibold text-sm flex items-center gap-2">
                                  <Users className="w-3 h-3 text-primary"/> {String(personaTitle || 'Untitled Persona')}
                              </p>
                              {painPoints.length > 0 && (
                                <div className="mt-3 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">Pain Points:</span>
                                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                   {painPoints.map((pp: any, i: number) => <li key={i}>{String(resolveFieldValue(pp))}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                          })
                        ) : (
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
                            {(Array.isArray(org.outreach?.emailAngles) ? org.outreach.emailAngles : []).map((angle: any, idx: number) => (
                              <div key={idx} className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 text-sm">
                                {String(resolveFieldValue(angle) || '')}
                              </div>
                            ))}
                            {(!org.outreach?.emailAngles || (Array.isArray(org.outreach.emailAngles) && org.outreach.emailAngles.length === 0)) && (
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
                            {(Array.isArray(org.outreach?.callOpeners) ? org.outreach.callOpeners : []).map((opener: any, idx: number) => (
                              <div key={idx} className="p-3 rounded-lg bg-green-50/50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/50 text-sm">
                                {String(resolveFieldValue(opener) || '')}
                              </div>
                            ))}
                            {(!org.outreach?.callOpeners || (Array.isArray(org.outreach.callOpeners) && org.outreach.callOpeners.length === 0)) && (
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
                                          "{String(resolveFieldValue(handler.objection))}"
                                        </p>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{String(resolveFieldValue(handler.response))}</p>
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

              {/* Events & Forums Tab */}
              <TabsContent value="events" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Upcoming Events */}
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        Upcoming Events
                      </CardTitle>
                      <CardDescription>
                        List upcoming events, webinars, or conferences for agent context
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <IntelligenceField
                        label="Upcoming Events List"
                        value={org.events?.upcoming}
                        multiline
                        placeholder="e.g. Annual Tech Summit (June 15), Q3 Webinar Series..."
                        onSave={(value) => updateMutation.mutate({ events: { ...org.events, upcoming: value } })}
                      />
                      <IntelligenceField
                        label="Event Strategy"
                        value={org.events?.strategy}
                        multiline
                        placeholder="Context on how to leverage these events in outreach..."
                        onSave={(value) => updateMutation.mutate({ events: { ...org.events, strategy: value } })}
                      />
                    </CardContent>
                  </Card>

                  {/* Forums & Communities */}
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        Forums & Communities
                      </CardTitle>
                      <CardDescription>
                        Industry forums and communities for engagement
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <IntelligenceField
                        label="Active Forums"
                        value={org.forums?.list}
                        multiline
                        placeholder="List active forums, LinkedIn groups, or communities..."
                        onSave={(value) => updateMutation.mutate({ forums: { ...org.forums, list: value } })}
                      />
                      <IntelligenceField
                        label="Engagement Strategy"
                        value={org.forums?.engagement_strategy}
                        multiline
                        placeholder="Rules of engagement for these communities..."
                        onSave={(value) => updateMutation.mutate({ forums: { ...org.forums, engagement_strategy: value } })}
                      />
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
