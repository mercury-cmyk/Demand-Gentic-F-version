import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Search, Sparkles, CheckCircle2, Loader2, Globe, Building2,
  Users, Target, ShieldCheck, FileText, Upload, Link as LinkIcon,
  Edit2, RotateCcw, Lock, Save, AlertCircle, Check, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// --- Types ---

type FieldStatus = "suggested" | "edited" | "verified";

interface IntelligenceField {
  value: string;
  source?: string;
  confidence: number;
  status: FieldStatus;
  locked: boolean;
}

interface AccountProfile {
  identity: {
    legalName: IntelligenceField;
    domain: IntelligenceField;
    description: IntelligenceField;
    industry: IntelligenceField;
    employees: IntelligenceField;
    regions: IntelligenceField;
  };
  offerings: {
    coreProducts: IntelligenceField;
    useCases: IntelligenceField;
    problemsSolved: IntelligenceField;
    differentiators: IntelligenceField;
  };
  icp: {
    industries: IntelligenceField;
    personas: IntelligenceField;
    objections: IntelligenceField;
  };
  positioning: {
    oneLiner: IntelligenceField;
    competitors: IntelligenceField;
    whyUs: IntelligenceField;
  };
  outreach: {
    emailAngles: IntelligenceField;
    callOpeners: IntelligenceField;
  };
}

const defaultField = (overrides?: Partial): IntelligenceField => ({
  value: overrides?.value ?? "",
  source: overrides?.source,
  confidence: overrides?.confidence ?? 0,
  status: overrides?.status ?? "suggested",
  locked: overrides?.locked ?? false,
});

const normalizeProfile = (raw: Partial | null | undefined): AccountProfile => ({
  identity: {
    legalName: defaultField(raw?.identity?.legalName),
    domain: defaultField(raw?.identity?.domain),
    description: defaultField(raw?.identity?.description),
    industry: defaultField(raw?.identity?.industry),
    employees: defaultField(raw?.identity?.employees),
    regions: defaultField(raw?.identity?.regions),
  },
  offerings: {
    coreProducts: defaultField(raw?.offerings?.coreProducts),
    useCases: defaultField(raw?.offerings?.useCases),
    problemsSolved: defaultField(raw?.offerings?.problemsSolved),
    differentiators: defaultField(raw?.offerings?.differentiators),
  },
  icp: {
    industries: defaultField(raw?.icp?.industries),
    personas: defaultField(raw?.icp?.personas),
    objections: defaultField(raw?.icp?.objections),
  },
  positioning: {
    oneLiner: defaultField(raw?.positioning?.oneLiner),
    competitors: defaultField(raw?.positioning?.competitors),
    whyUs: defaultField(raw?.positioning?.whyUs),
  },
  outreach: {
    emailAngles: defaultField(raw?.outreach?.emailAngles),
    callOpeners: defaultField(raw?.outreach?.callOpeners),
  },
});

// --- Mock Data Generator (REMOVED - now using real API) ---

// --- Components ---

const SmartField = ({ 
  label, 
  field, 
  onUpdate, 
  multiline = false 
}: { 
  label: string; 
  field: IntelligenceField; 
  onUpdate: (updates: Partial) => void;
  multiline?: boolean;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(field.value);

  // Sync tempValue with field.value when it changes from parent
  useEffect(() => {
    setTempValue(field.value);
  }, [field.value]);

  const handleSave = () => {
    onUpdate({ value: tempValue, status: "edited" });
    setIsEditing(false);
  };

  const handleRevert = () => {
    // In a real app, we'd revert to the original AI suggestion
    setTempValue(field.value); 
    onUpdate({ status: "suggested" });
  };

  return (
    
      
        {label}
        
          {field.status === "suggested" && (
            
               AI Suggested
            
          )}
          {field.status === "edited" && (
            
               Human Edited
            
          )}
          {field.status === "verified" && (
            
               Verified
            
          )}
          
          {!isEditing && !field.locked && (
             setIsEditing(true)}>
              
            
          )}
          {field.status === "edited" && (
            
              
            
          )}
        
      

      
        {isEditing ? (
          
            {multiline ? (
               setTempValue(e.target.value)} className="min-h-[80px]" />
            ) : (
               setTempValue(e.target.value)} />
            )}
            
               setIsEditing(false)}>Cancel
              Save
            
          
        ) : (
          
            {field.value}
          
        )}
      
    
  );
};

interface AccountIntelligenceViewProps {
  organizationId?: string | null;
}

export function AccountIntelligenceView({ organizationId }: AccountIntelligenceViewProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState("idle");
  const [domain, setDomain] = useState("");
  const [context, setContext] = useState("");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [analysisMetadata, setAnalysisMetadata] = useState(null);
  const { toast } = useToast();

  const steps = [
    { label: "Initializing Deep Research", progress: 5 },
    { label: "Web Research & Data Gathering", progress: 15 },
    { label: "Analyzing Company Identity", progress: 30 },
    { label: "Evaluating Offerings & Value Prop", progress: 45 },
    { label: "ICP & Market Analysis", progress: 60 },
    { label: "Competitive Positioning", progress: 75 },
    { label: "AI Reasoning & Synthesis", progress: 90 },
    { label: "Final Intelligence Assembly", progress: 100 },
  ];

  const handleAnalyze = async () => {
    if (!domain) return;
    setState("analyzing");
    setProgress(0);
    setError(null);
    setCurrentStep("Connecting to AI...");

    // Simulate progress while API call is in progress
    let stepIndex = 0;
    const progressInterval = setInterval(() => {
      if (stepIndex  {
        const normalized = normalizeProfile(data.profile);
        setProfile(normalized);
        setDomain(normalized.identity.domain.value || domain);
        setAnalysisMetadata({
          models: data.models,
          reasoning: data.reasoning,
        });
        setState("review");
        
        if (data.existingAccounts && data.existingAccounts.length > 0) {
          toast({
            title: "Existing Accounts Found",
            description: `Found ${data.existingAccounts.length} matching account(s) in your CRM`,
          });
        }
        
        if (data.models && data.models.length > 0) {
          const modelList = Array.isArray(data.models) ? data.models.join(', ') : data.models;
          const sourcesInfo = data.reasoning?.includes('web research') 
            ? ' with live web research' 
            : '';
          toast({
            title: "Advanced AI Analysis Complete",
            description: `Models: ${modelList}${sourcesInfo}`,
          });
        }
      }, 500);

    } catch (err: any) {
      clearInterval(progressInterval);
      console.error("Analysis error:", err);
      setError(err.message || "Failed to analyze organization");
      setState("idle");
      
      toast({
        title: "Analysis Failed",
        description: err.message || "Failed to analyze organization. Please try again.",
        variant: "destructive",
      });
    }
  };

  const updateField = (section: keyof AccountProfile, field: string, updates: Partial) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const normalized = normalizeProfile(prev);
      const sectionData = (normalized as any)[section] ?? {};
      const existingField = sectionData[field] ?? defaultField();
      return normalizeProfile({
        ...normalized,
        [section]: {
          ...sectionData,
          models: analysisMetadata?.models,
          reasoning: analysisMetadata?.reasoning,
          [field]: { ...existingField, ...updates }
        }
      } as AccountProfile);
    });
  };

  const handleSave = async () => {
    if (!profile || !domain) return;

    try {
      const response = await apiRequest("POST", "/api/org-intelligence/save", {
        domain,
        profile,
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Invalidate organizations query so the selector refreshes
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/dropdown"] });

      toast({
        title: "Profile Saved",
        description: "Organization intelligence profile has been saved successfully.",
      });

    } catch (err: any) {
      console.error("Save error:", err);
      toast({
        title: "Save Failed",
        description: err.message || "Failed to save organization profile.",
        variant: "destructive",
      });
    }
  };

  // === AI-Powered Enhancement State ===
  const [enhanceDialogOpen, setEnhanceDialogOpen] = useState(false);
  const [enhanceContent, setEnhanceContent] = useState("");
  const [enhanceState, setEnhanceState] = useState("input");
  const [enhanceResult, setEnhanceResult] = useState;
    summary: string;
  } | null>(null);

  const handleEnhance = async () => {
    if (!enhanceContent.trim() || !profile || !domain) return;
    setEnhanceState("processing");

    try {
      const response = await apiRequest("POST", "/api/org-intelligence/enhance", {
        domain,
        existingProfile: profile,
        pastedContent: enhanceContent.trim(),
      }, { timeout: 90000 });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setEnhanceResult({
        mergedProfile: normalizeProfile(data.mergedProfile),
        changes: data.changes,
        summary: data.summary,
      });
      setEnhanceState("review");
    } catch (err: any) {
      toast({ title: "Enhancement Failed", description: err.message || "Failed to enhance profile", variant: "destructive" });
      setEnhanceState("input");
    }
  };

  const handleApplyEnhancement = () => {
    if (!enhanceResult) return;
    setProfile(enhanceResult.mergedProfile);
    setEnhanceDialogOpen(false);
    setEnhanceState("input");
    setEnhanceContent("");
    setEnhanceResult(null);
    toast({ title: "Profile Updated", description: "AI-merged changes applied. Review and click Save Profile when ready." });
  };

  // Load existing profile when organizationId changes
  useEffect(() => {
    // Skip loading if no organizationId provided
    if (!organizationId) {
      setProfile(null);
      setDomain("");
      setState("idle");
      return;
    }

    const loadExistingProfile = async () => {
      try {
        const response = await apiRequest("GET", `/api/org-intelligence/profile?organizationId=${organizationId}`);
        const data = await response.json();

        if (data.profile) {
          const normalized = normalizeProfile(data.profile);
          setDomain(normalized.identity.domain.value || "");
          setProfile(normalized);
          setState("review");
        } else {
          // Reset to idle if no profile for this org
          setProfile(null);
          setDomain("");
          setState("idle");
        }
      } catch (err) {
        console.error("Failed to load existing profile:", err);
      }
    };

    loadExistingProfile();
  }, [organizationId]);

  if (state === "idle") {
    return (
      
        {error && (
          
            
              
              {error}
            
          
        )}

        
            
                
                    
                
                
                    Analyze Your Organization
                
                
                    Enter your website domain to generate a comprehensive intelligence profile using deep web research and multi-model AI synthesis.
                
            

            
                
                    
                        
                            
                             setDomain(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                            />
                        
                        
                            
                            Starts Analysis
                        
                    

                    
                        
                            Additional Context (Optional)
                        
                         setContext(e.target.value)}
                        />
                    
                
            

            
                
                    
                    Deep Web Research
                
                 
                    
                    Multi-Model AI (Gemini + GPT-4)
                
                 
                    
                    Live Verification
                
            
        
      
    );
  }

  if (state === "analyzing") {
    return (
      
        
          
            
          
          Analyzing {domain}...
          
             Our AI agents are gathering intelligence from multiple sources.
          
        

        
          
            {/* Progress Bar */}
            
              
                {currentStep}
                {progress}%
              
              
                
              
            

            {steps.map((step, index) => {
              const isCompleted = progress >= step.progress;
              const isCurrent = progress = steps[index - 1].progress);
              
              return (
                
                  
                    {isCompleted ?  : 
                     isCurrent ?  : 
                     {index + 1}}
                  
                  
                    
                      {step.label}
                    
                  
                  {isCurrent && Processing}
                  {isCompleted && Done}
                
              );
            })}
          
        

        
          
          AI is working autonomously...
        
      
    );
  }

  const safeProfile = profile ? normalizeProfile(profile) : null;

  if (state === "review" && safeProfile) {
    return (
      
        
             
                 
                    
                 
                 
                    {safeProfile.identity.legalName.value}
                    
                        
                            {safeProfile.identity.domain.value}
                        
                        •
                         {safeProfile.identity.employees.value} employees
                    
                 
             
             
          
             setEnhanceDialogOpen(true)}>
              
              AI-Powered Update
            
             setState("idle")}>
              
              Analyze New
            
            
              
              Save Profile
            
          
        

        
            {/* Hidden original redundant card to keep safe just in case, but actually I will just remove it in the replacement */}
        

        {/* Keeping the tabs as is */}
        
          
            Identity
            Offerings
            ICP & Market
            Positioning
          

          
            
              
                
                  
                    
                    Core Identity
                  
                
                
                  
                     updateField('identity', 'legalName', u)} 
                    />
                     updateField('identity', 'industry', u)} 
                    />
                     updateField('identity', 'regions', u)} 
                    />
                     updateField('identity', 'employees', u)} 
                    />
                  
                  
                   updateField('identity', 'description', u)} 
                    multiline 
                  />
                
              
              
              
                
                  
                    
                      
                      Configuration
                    
                  
                  
                    
                      Auto-Update Intelligence
                      
                    
                    
                      Require Human Approval
                      
                    
                    
                    
                      Last updated by System AI
                      
                      {new Date().toLocaleDateString()}
                    
                  
                
              
            
          

          
            
              
                
                  
                  Your Offerings & Use Cases
                
                
                  Define what you sell and the problems you solve
                
              
              
                 updateField('offerings', 'coreProducts', u)} 
                  multiline
                />
                
                   updateField('offerings', 'useCases', u)} 
                    multiline
                  />
                   updateField('offerings', 'problemsSolved', u)} 
                    multiline
                  />
                
                 updateField('offerings', 'differentiators', u)} 
                  multiline
                />
              
            
          

          
             
              
                
                  
                  Your ICP & Target Personas
                
                
                  Who are you selling to?
                
              
              
                
                   updateField('icp', 'industries', u)} 
                  />
                   updateField('icp', 'personas', u)} 
                  />
                
                 updateField('icp', 'objections', u)} 
                  multiline
                />
              
            
          

          
             
              
                
                  
                    
                    Positioning Strategy
                  
                
                
                   updateField('positioning', 'oneLiner', u)} 
                    multiline
                  />
                   updateField('positioning', 'competitors', u)} 
                  />
                   updateField('positioning', 'whyUs', u)} 
                    multiline
                  />
                
              

              
                
                  
                    
                    Outreach Readiness
                  
                
                
                   updateField('outreach', 'emailAngles', u)} 
                    multiline
                  />
                   updateField('outreach', 'callOpeners', u)} 
                    multiline
                  />
                
              
            
          
        

        {/* AI-Powered Enhancement Dialog */}
         {
          setEnhanceDialogOpen(open);
          if (!open) { setEnhanceState("input"); setEnhanceResult(null); }
        }}>
          
            
              
                
                AI-Powered Profile Update
              
              
                Paste any new information about your organization. The AI will strategically
                merge it with your existing profile, updating fields where the new info is
                more current or complete.
              
            

            {enhanceState === "input" && (
              
                 setEnhanceContent(e.target.value)}
                />
                
                  Examples: product launch announcement, updated competitor analysis,
                  new customer testimonials, revised target personas, pricing changes, company news
                
              
            )}

            {enhanceState === "processing" && (
              
                
                  
                  
                    
                  
                
                AI is analyzing and merging your new information...
                This usually takes 10-20 seconds
              
            )}

            {enhanceState === "review" && enhanceResult && (
              
                
                  {enhanceResult.summary}
                  
                    {enhanceResult.changes.length} change{enhanceResult.changes.length !== 1 ? 's' : ''}
                  
                

                {enhanceResult.changes.length === 0 ? (
                  
                    
                    Profile is already up to date
                    The new information didn't contain anything that improves the existing profile.
                  
                ) : (
                  
                    
                      {enhanceResult.changes.map((change, idx) => (
                        
                          
                            
                              {change.label}
                              
                                {change.changeType === "updated" ? "Updated" : "New Data"}
                              
                            
                            {change.previousValue && (
                              
                                {change.previousValue.length > 200 ? change.previousValue.slice(0, 200) + '...' : change.previousValue}
                              
                            )}
                            
                              {change.newValue.length > 200 ? change.newValue.slice(0, 200) + '...' : change.newValue}
                            
                            {change.reason && change.reason !== "unchanged" && (
                              
                                 {change.reason}
                              
                            )}
                          
                        
                      ))}
                    
                  
                )}
              
            )}

            
              {enhanceState === "input" && (
                <>
                   setEnhanceDialogOpen(false)}>Cancel
                  
                    
                    Analyze & Merge
                  
                
              )}
              {enhanceState === "review" && (
                <>
                   { setEnhanceState("input"); setEnhanceResult(null); }}>
                    Try Again
                  
                  {enhanceResult && enhanceResult.changes.length > 0 && (
                    
                      
                      Apply {enhanceResult.changes.length} Change{enhanceResult.changes.length !== 1 ? 's' : ''}
                    
                  )}
                
              )}
            
          
        
      
    );
  }

  return null;
}