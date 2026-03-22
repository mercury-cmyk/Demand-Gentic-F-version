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
  MapPin,
  ExternalLink,
  Link2,
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
    personas?: Array;
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
    objectionHandlers?: Array;
  };
  updatedAt?: string;
}

interface AnalysisProgress {
  phase: string;
  message: string;
  progress: number;
}

async function fetchOrgIntelligence(): Promise {
  const res = await fetch('/api/client-portal/settings/organization-intelligence', {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed to fetch organization intelligence');
  return res.json();
}

async function updateOrgIntelligence(data: Partial): Promise {
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

async function createOrganization(data: { name: string; domain?: string; industry?: string }): Promise {
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
  icon?: React.ComponentType;
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
    
      
        
          {Icon && }
          {label}
        
        {onSave && !isEditing && (
           setIsEditing(true)}
          >
            
          
        )}
      
      {isEditing ? (
        
          {multiline ? (
             setTempValue(e.target.value)}
              className="min-h-[80px] text-sm"
            />
          ) : (
             setTempValue(e.target.value)}
              className="text-sm"
            />
          )}
          
             setIsEditing(false)}>
              Cancel
            
            
              
              Save
            
          
        
      ) : (
        
          {String(displayValue || placeholderText)}
        
      )}
    
  );
}

function AnalysisProgressPanel({ progress }: { progress: AnalysisProgress | null }) {
  if (!progress) return null;

  const phaseIcons: Record = {
    init: ,
    research: ,
    analysis: ,
    synthesis: ,
    save: ,
    complete: ,
  };

  return (
    
      
        
          {phaseIcons[progress.phase] || }
          {progress.message}
        
        
        {progress.progress}%
      
    
  );
}

export default function ClientPortalIntelligence() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDomain, setNewOrgDomain] = useState('');
  // Brand identity state
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [brandPrimaryColor, setBrandPrimaryColor] = useState('');
  const [brandSecondaryColor, setBrandSecondaryColor] = useState('');
  const [extractedColors, setExtractedColors] = useState([]);
  const [isExtractingColors, setIsExtractingColors] = useState(false);
  const [brandDirty, setBrandDirty] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['client-org-intelligence'],
    queryFn: fetchOrgIntelligence,
    staleTime: 0, // Always fetch fresh data to avoid sync issues
    refetchOnWindowFocus: true,
  });

  // Fetch linked external events (upcoming events from Argyle etc.)
  const { data: linkedEventsData } = useQuery({
    queryKey: ['client-linked-events'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/settings/linked-events', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return { events: [] };
      return res.json();
    },
    staleTime: 60_000,
  });
  const linkedEvents: Array = linkedEventsData?.events || [];

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
            let event: any;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              // Skip invalid JSON lines
              continue;
            }
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
                description: `Analyzed with ${event.data?.meta?.modelCount || 0} AI models and ${event.data?.meta?.researchSources || 0} sources.`,
              });
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Analysis failed');
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
      
        
          
        
      
    );
  }

  return (
    
      
        {/* Header */}
        
          
            Organization Intelligence
            
              AI-powered insights about your organization for smarter campaign execution
            
          
          {org && (
            
               
                    Last updated: {org.updatedAt ? new Date(org.updatedAt).toLocaleDateString() : 'Never'}
               
               refetch()} variant="outline" size="icon" className="h-9 w-9" title="Refresh Data">
                
              
            
          )}
        

        {/* Analysis Progress */}
        {analysisProgress && (
           
             
           
        )}

        {/* No Organization State */}
        {!org && !showCreateForm && (
          
            
              
                
              
              
                No Organization Profile Found
                
                  Create your organization profile to unlock AI-powered intelligence and better campaign targeting.
                
              
               setShowCreateForm(true)} size="lg" className="mt-4">
                
                Create Organization Profile
              
            
          
        )}

        {/* Create Organization Form */}
        {showCreateForm && (
          
            
              Create Organization Profile
              Enter your company details to get started
            
            
              
                Organization Name *
                 setNewOrgName(e.target.value)}
                />
              
              
                Website Domain
                
                  
                   setNewOrgDomain(e.target.value)}
                  />
                
              
            
            
               setShowCreateForm(false)}>
                Cancel
              
               createMutation.mutate({ name: newOrgName, domain: newOrgDomain })}
                disabled={!newOrgName || createMutation.isPending}
              >
                {createMutation.isPending && }
                Create Profile
              
            
          
        )}

        {/* Organization Intelligence Content */}
        {org && (
          
            {/* Intelligence Tabs */}
            
              
                
                  Identity & Branding
                  Offerings
                  ICP & Market
                  Positioning
                  Outreach
                  Events & Forums
                

                {/* Deep Analysis Section */}
                
                   setDomain(e.target.value)}
                    className="h-9 text-sm w-48"
                  />
                  
                    {isAnalyzing ?  : }
                    {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                  
                
              

              {/* Overview Tab (Renamed Identity) */}
              
                
                  
                    
                      
                      Organization Identity
                    
                  
                  
                     updateMutation.mutate({ identity: { ...org.identity, legalName: value } })}
                    />
                    
                    
                       updateMutation.mutate({ identity: { ...org.identity, description: value } })}
                      />
                    
                     updateMutation.mutate({ identity: { ...org.identity, industry: value } })}
                    />
                     updateMutation.mutate({ identity: { ...org.identity, employees: value } })}
                    />
                     updateMutation.mutate({ identity: { ...org.identity, regions: value.split(',').map(s => s.trim()) } })}
                    />
                  
                

                
                
                  {/* Brand Identity Card - Left column */}
                  
                    
                      
                        
                        Brand Identity
                      
                      
                        Visual identity and brand colors
                      
                    
                    
                      {/* Logo Section */}
                      
                        Brand Logo
                        
                          
                            
                              {brandLogoUrl ? (
                                 { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              ) : (
                                
                                  
                                  No logo
                                
                              )}
                            
                          
                          
                            Logo URL
                             {
                                setBrandLogoUrl(e.target.value);
                                setExtractedColors([]);
                                setBrandDirty(true);
                              }}
                              className="text-xs h-8"
                            />
                            
                              {brandLogoUrl && (
                                <>
                                  
                                    {isExtractingColors ? (
                                      
                                    ) : (
                                      
                                    )}
                                    Extract Colors
                                  
                                   {
                                      setBrandLogoUrl('');
                                      setExtractedColors([]);
                                      setBrandDirty(true);
                                    }}
                                  >
                                    
                                    Remove
                                  
                                
                              )}
                            
                          
                        
                      

                      {/* Extracted Colors */}
                      {extractedColors.length > 0 && (
                        
                          Colors from Logo
                          
                            
                              {extractedColors.map((color, idx) => (
                                 {
                                    setBrandPrimaryColor(color.hex);
                                    setBrandDirty(true);
                                  }}
                                  title={`${color.hex} (${color.percentage}%)`}
                                >
                                  {idx === 0 && (
                                    
                                      
                                    
                                  )}
                                
                              ))}
                            
                            
                              Click to set as primary color
                            
                          
                        
                      )}

                      

                      {/* Color Pickers */}
                      
                        Brand Colors

                        {/* Primary Color */}
                        
                          Primary Color
                          
                             { setBrandPrimaryColor(e.target.value); setBrandDirty(true); }}
                              className="h-9 w-12 rounded-lg border cursor-pointer"
                            />
                             { setBrandPrimaryColor(e.target.value); setBrandDirty(true); }}
                              placeholder="#3B82F6"
                              className="font-mono text-xs h-8 max-w-[120px]"
                            />
                          
                        

                        {/* Secondary Color */}
                        
                          Secondary Color
                          
                             { setBrandSecondaryColor(e.target.value); setBrandDirty(true); }}
                              className="h-9 w-12 rounded-lg border cursor-pointer"
                            />
                             { setBrandSecondaryColor(e.target.value); setBrandDirty(true); }}
                              placeholder="#8B5CF6"
                              className="font-mono text-xs h-8 max-w-[120px]"
                            />
                          
                        

                        {/* Quick Presets */}
                        
                          Quick Presets
                          
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
                               { setBrandPrimaryColor(preset.color); setBrandDirty(true); }}
                                title={preset.name}
                              />
                            ))}
                          
                        
                      

                      

                      {/* Preview */}
                      
                        Preview
                        
                          
                            {brandLogoUrl ? (
                              
                            ) : (
                              
                                
                                  {(org.name || 'Co')[0]?.toUpperCase()}
                                
                              
                            )}
                            {org.name || 'Your Company'}
                          
                          
                            
                              Primary
                            
                            
                              Secondary
                            
                          
                          
                            
                            
                          
                        
                      

                      
                        {updateMutation.isPending && }
                        Save Brand Identity
                      
                    
                  

                  {/* Voice & Communication Card - Right 2 columns */}
                  
                    
                      
                        
                        Voice & Communication
                      
                      
                        Define how your AI agents should speak and represent your brand
                      
                    
                    
                       updateMutation.mutate({ branding: { ...org.branding, tone: value } })}
                      />
                       updateMutation.mutate({ branding: { ...org.branding, communicationStyle: value } })}
                      />
                      
                         updateMutation.mutate({ branding: { ...org.branding, keywords: value.split(',').map(s => s.trim()) } })}
                        />
                      
                      
                         updateMutation.mutate({ branding: { ...org.branding, forbiddenTerms: value.split(',').map(s => s.trim()) } })}
                        />
                      
                    
                  
                
              

              {/* Offerings Tab */}
              
                
                    
                      
                        
                          
                          Products & Services
                        
                        
                          What your organization offers and the problems you solve
                        
                      
                      
                         updateMutation.mutate({ offerings: { ...org.offerings, coreProducts: value.split(',').map(s => s.trim()) } })}
                        />
                         
                             updateMutation.mutate({ offerings: { ...org.offerings, useCases: value.split(',').map(s => s.trim()) } })}
                            />
                             updateMutation.mutate({ offerings: { ...org.offerings, problemsSolved: value.split(',').map(s => s.trim()) } })}
                            />
                        
                         updateMutation.mutate({ offerings: { ...org.offerings, differentiators: value.split(',').map(s => s.trim()) } })}
                        />
                      
                    
                
              

              {/* Target Market Tab */}
              
                
                  
                    
                      
                      Ideal Customer Profile
                    
                    
                      Your target market and buyer personas
                    
                  
                  
                    
                         updateMutation.mutate({ icp: { ...org.icp, industries: value.split(',').map(s => s.trim()) } })}
                        />
                         updateMutation.mutate({ icp: { ...org.icp, companySize: value } })}
                        />
                    
                    
                      
                        
                        Target Personas
                      
                      
                        {(Array.isArray(org.icp?.personas) && org.icp.personas.length > 0) ? (
                          org.icp.personas.map((persona: any, idx: number) => {
                          const personaTitle = resolveFieldValue(persona?.title) || resolveFieldValue(persona);
                          const painPoints = Array.isArray(persona?.painPoints) ? persona.painPoints : [];
                          return (
                            
                              
                                   {String(personaTitle || 'Untitled Persona')}
                              
                              {painPoints.length > 0 && (
                                
                                  Pain Points:
                                  
                                   {painPoints.map((pp: any, i: number) => {String(resolveFieldValue(pp))})}
                                  
                                
                              )}
                            
                          );
                          })
                        ) : (
                          
                            No personas defined
                          
                        )}
                      
                    
                     updateMutation.mutate({ icp: { ...org.icp, objections: value.split(',').map(s => s.trim()) } })}
                    />
                  
                
              

              {/* Positioning Tab */}
              
                
                    
                      
                        
                          
                          Market Positioning
                        
                        
                          How you differentiate from competitors
                        
                      
                      
                         updateMutation.mutate({ positioning: { ...org.positioning, oneLiner: value } })}
                        />
                         updateMutation.mutate({ positioning: { ...org.positioning, valueProposition: value } })}
                        />
                         updateMutation.mutate({ positioning: { ...org.positioning, whyUs: value.split(',').map(s => s.trim()) } })}
                        />
                      
                    
                    
                     
                      
                        
                          
                          Competitive Landscape
                        
                      
                      
                         updateMutation.mutate({ positioning: { ...org.positioning, competitors: value.split(',').map(s => s.trim()) } })}
                        />
                      
                    
                
              

              {/* Outreach Tab */}
              
                
                    
                      
                        
                          
                          Outreach Strategy
                        
                        
                          Messaging angles and scripts
                        
                      
                      
                        
                          
                            
                            Email Angles
                          
                          
                            {(Array.isArray(org.outreach?.emailAngles) ? org.outreach.emailAngles : []).map((angle: any, idx: number) => (
                              
                                {String(resolveFieldValue(angle) || '')}
                              
                            ))}
                            {(!org.outreach?.emailAngles || (Array.isArray(org.outreach.emailAngles) && org.outreach.emailAngles.length === 0)) && (
                              
                                Run deep analysis to generate email angles
                              
                            )}
                          
                        
                        
                        
                          
                            
                            Call Openers
                          
                          
                            {(Array.isArray(org.outreach?.callOpeners) ? org.outreach.callOpeners : []).map((opener: any, idx: number) => (
                              
                                {String(resolveFieldValue(opener) || '')}
                              
                            ))}
                            {(!org.outreach?.callOpeners || (Array.isArray(org.outreach.callOpeners) && org.outreach.callOpeners.length === 0)) && (
                              
                                Run deep analysis to generate call openers
                              
                            )}
                          
                        
                      
                    

                    
                         
                            
                              
                              Objection Handling
                            
                         
                         
                            {org.outreach?.objectionHandlers && org.outreach.objectionHandlers.length > 0 ? (
                                
                                    {org.outreach.objectionHandlers.map((handler, idx) => (
                                      
                                        
                                          "{String(resolveFieldValue(handler.objection))}"
                                        
                                        {String(resolveFieldValue(handler.response))}
                                      
                                    ))}
                                
                            ) : (
                                
                                    No objection handlers available.
                                
                            )}
                         
                    
                
              

              {/* Events & Forums Tab */}
              
                {/* Linked Upcoming Events from Event Intelligence */}
                {linkedEvents.length > 0 && (
                  
                    
                      
                        
                        Linked Upcoming Events
                      
                      
                        Events synced from your event intelligence — used as context for AI agents and outreach
                      
                    
                    
                      
                        {linkedEvents.map((event) => {
                          const dateStr = event.startAtHuman || (event.startAtIso ? new Date(event.startAtIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null);
                          return (
                            
                              
                                {event.title}
                                {event.sourceUrl && (
                                  
                                    
                                  
                                )}
                              

                              
                                {event.eventType && (
                                  {event.eventType}
                                )}
                                {event.community && (
                                  {event.community}
                                )}
                              

                              
                                {dateStr && (
                                  
                                    
                                    {dateStr}
                                  
                                )}
                                {event.location && (
                                  
                                    
                                    {event.location}
                                  
                                )}
                              

                              {event.overviewExcerpt && (
                                
                                  {event.overviewExcerpt}
                                
                              )}

                              {/* Draft / Work Order status */}
                              {event.draftStatus && (
                                
                                  
                                    {event.hasWorkOrder ? 'Work Order Created' : event.draftStatus === 'submitted' ? 'Submitted' : 'Draft Ready'}
                                  
                                
                              )}
                            
                          );
                        })}
                      
                    
                  
                )}

                
                  {/* Upcoming Events - Manual */}
                  
                    
                      
                        
                        Upcoming Events
                      
                      
                        {linkedEvents.length > 0
                          ? 'Additional events or notes not covered by linked events above'
                          : 'List upcoming events, webinars, or conferences for agent context'}
                      
                    
                    
                       updateMutation.mutate({ events: { ...org.events, upcoming: value } })}
                      />
                       updateMutation.mutate({ events: { ...org.events, strategy: value } })}
                      />
                    
                  

                  {/* Forums & Communities */}
                  
                    
                      
                        
                        Forums & Communities
                      
                      
                        Industry forums and communities for engagement
                      
                    
                    
                       updateMutation.mutate({ forums: { ...org.forums, list: value } })}
                      />
                       updateMutation.mutate({ forums: { ...org.forums, engagement_strategy: value } })}
                      />
                    
                  
                
              
            

            {/* Linked Campaigns */}
            {data?.campaigns && data.campaigns.length > 0 && (
              
                  
                      
                      Active Campaigns Using This Intelligence
                  
                  
                    {data.campaigns.map((campaign) => (
                      
                          
                              {campaign.name}
                              
                                  
                                      {campaign.status}
                                  
                              
                          
                      
                    ))}
                  
              
            )}
          
        )}
      
    
  );
}