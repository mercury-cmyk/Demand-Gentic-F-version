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
  onUpdate: (updates: Partial<IntelligenceField>) => void;
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
    <div className="space-y-2 group">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {field.status === "suggested" && (
            <Badge variant="secondary" className="text-[10px] h-5 bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200">
              <Sparkles className="w-3 h-3 mr-1" /> AI Suggested
            </Badge>
          )}
          {field.status === "edited" && (
            <Badge variant="secondary" className="text-[10px] h-5 bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200">
              <Edit2 className="w-3 h-3 mr-1" /> Human Edited
            </Badge>
          )}
          {field.status === "verified" && (
            <Badge variant="secondary" className="text-[10px] h-5 bg-green-50 text-green-700 hover:bg-green-100 border-green-200">
              <Check className="w-3 h-3 mr-1" /> Verified
            </Badge>
          )}
          
          {!isEditing && !field.locked && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditing(true)}>
              <Edit2 className="h-3 w-3" />
            </Button>
          )}
          {field.status === "edited" && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleRevert} title="Revert to AI">
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        {isEditing ? (
          <div className="space-y-2">
            {multiline ? (
              <Textarea value={tempValue} onChange={(e) => setTempValue(e.target.value)} className="min-h-[80px]" />
            ) : (
              <Input value={tempValue} onChange={(e) => setTempValue(e.target.value)} />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave}>Save</Button>
            </div>
          </div>
        ) : (
          <div className={cn(
            "p-3 rounded-md border bg-card text-sm",
            field.status === "suggested" && "border-blue-100 bg-blue-50/30",
            field.status === "edited" && "border-amber-100 bg-amber-50/30",
            field.status === "verified" && "border-green-100 bg-green-50/30"
          )}>
            {field.value}
          </div>
        )}
      </div>
    </div>
  );
};

interface AccountIntelligenceViewProps {
  organizationId?: string | null;
}

export function AccountIntelligenceView({ organizationId }: AccountIntelligenceViewProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "analyzing" | "review">("idle");
  const [domain, setDomain] = useState("");
  const [context, setContext] = useState("");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisMetadata, setAnalysisMetadata] = useState<{
    models?: string[];
    reasoning?: string;
  } | null>(null);
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
      if (stepIndex < steps.length - 1) {
        stepIndex++;
        setProgress(steps[stepIndex].progress);
        setCurrentStep(steps[stepIndex].label);
      }
    }, 1500);

    try {
      const payload: { domain: string; context?: string } = { domain };
      const trimmedContext = context.trim();
      if (trimmedContext) {
        payload.context = trimmedContext;
      }

      // Extended timeout for AI analysis (3 minutes) since multi-model analysis takes time
      const response = await apiRequest("POST", "/api/org-intelligence/analyze", payload, { timeout: 180000 });

      const data = await response.json();

      clearInterval(progressInterval);

      if (data.error) {
        throw new Error(data.error);
      }

      setProgress(100);
      setCurrentStep("Complete!");
      
      // Small delay to show completion
      setTimeout(() => {
        setProfile(data.profile);
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

  const updateField = (section: keyof AccountProfile, field: string, updates: Partial<IntelligenceField>) => {
    if (!profile) return;
    setProfile({
      ...profile,
      [section]: {
        ...profile[section],
        models: analysisMetadata?.models,
        reasoning: analysisMetadata?.reasoning,
        [field]: { ...(profile[section] as any)[field], ...updates }
      }
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

  // Load existing profile when organizationId changes
  useEffect(() => {
    const loadExistingProfile = async () => {
      try {
        const url = organizationId
          ? `/api/org-intelligence/profile?organizationId=${organizationId}`
          : "/api/org-intelligence/profile";
        const response = await apiRequest("GET", url);
        const data = await response.json();

        if (data.profile) {
          setDomain(data.profile.domain || "");
          setProfile(data.profile);
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
      <div className="h-full flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
        {error && (
          <Card className="border-destructive/50 bg-destructive/10 max-w-2xl w-full mb-6">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <div className="text-sm text-destructive">{error}</div>
            </CardContent>
          </Card>
        )}

        <div className="max-w-3xl w-full space-y-8 text-center">
            <div className="space-y-4">
                <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full mb-4">
                    <Sparkles className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-4xl font-light tracking-tight text-foreground">
                    Analyze Your Organization
                </h2>
                <p className="text-xl text-muted-foreground font-light max-w-2xl mx-auto">
                    Enter your website domain to generate a comprehensive intelligence profile using deep web research and multi-model AI synthesis.
                </p>
            </div>

            <Card className="shadow-xl border-primary/20 bg-background/60 backdrop-blur-sm">
                <CardContent className="p-8 space-y-8">
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch">
                        <div className="relative flex-1">
                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input 
                                placeholder="e.g. yourcompany.com" 
                                className="pl-12 h-14 text-lg" 
                                value={domain}
                                onChange={(e) => setDomain(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                            />
                        </div>
                        <Button 
                            onClick={handleAnalyze} 
                            disabled={!domain} 
                            size="lg"
                            className="h-14 px-8 text-lg font-medium shadow-md transition-all hover:scale-105 bg-gradient-to-r from-fuchsia-600 to-primary"
                        >
                            <Zap className="mr-2 h-5 w-5" />
                            Starts Analysis
                        </Button>
                    </div>

                    <div className="space-y-3 text-left">
                        <Label htmlFor="company-context" className="text-sm font-medium ml-1">
                            Additional Context (Optional)
                        </Label>
                        <Textarea
                            id="company-context"
                            placeholder="Paste specific details about your positioning, ICPs, or value props to guide the AI..."
                            className="min-h-[100px] resize-none text-base p-4"
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-center gap-8 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>Deep Web Research</span>
                </div>
                 <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>Multi-Model AI (Gemini + GPT-4)</span>
                </div>
                 <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>Live Verification</span>
                </div>
            </div>
        </div>
      </div>
    );
  }

  if (state === "analyzing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] max-w-2xl mx-auto space-y-10 animate-in fade-in duration-500">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-4 bg-primary/5 rounded-full mb-2 animate-pulse">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-3xl font-light tracking-tight">Analyzing {domain}...</h2>
          <p className="text-xl text-muted-foreground font-light">
             Our AI agents are gathering intelligence from multiple sources.
          </p>
        </div>

        <Card className="w-full shadow-lg border-primary/10">
          <CardContent className="p-6 space-y-6">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{currentStep}</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {steps.map((step, index) => {
              const isCompleted = progress >= step.progress;
              const isCurrent = progress < step.progress && (index === 0 || progress >= steps[index - 1].progress);
              
              return (
                <div key={index} className="flex items-center gap-4">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                    isCompleted ? "bg-primary border-primary text-primary-foreground" : 
                    isCurrent ? "border-primary text-primary animate-pulse" : "border-muted text-muted-foreground"
                  )}>
                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : 
                     isCurrent ? <Loader2 className="w-5 h-5 animate-spin" /> : 
                     <span className="text-xs">{index + 1}</span>}
                  </div>
                  <div className="flex-1">
                    <p className={cn("font-medium", isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground")}>
                      {step.label}
                    </p>
                  </div>
                  {isCurrent && <Badge variant="outline" className="animate-pulse">Processing</Badge>}
                  {isCompleted && <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">Done</Badge>}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Zap className="h-3 w-3 text-amber-500" />
          <span>AI is working autonomously...</span>
        </div>
      </div>
    );
  }

  if (state === "review" && profile) {
    return (
      <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex justify-between items-center">
             <div className="flex items-center gap-3">
                 <div className="bg-primary/10 p-2 rounded-lg">
                    <Building2 className="h-6 w-6 text-primary" />
                 </div>
                 <div>
                    <h2 className="text-2xl font-semibold tracking-tight">{profile.identity?.legalName?.value || 'Organization'}</h2>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {profile.identity?.domain?.value && (
                          <>
                            <a href={`https://${profile.identity.domain.value}`} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors hover:underline">
                                {profile.identity.domain.value}
                            </a>
                            <span>•</span>
                          </>
                        )}
                        {profile.identity?.employees?.value && (
                          <span>{profile.identity.employees.value} employees</span>
                        )}
                    </div>
                 </div>
             </div>
             
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setState("idle")}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Analyze New
            </Button>
            <Button className="bg-primary hover:bg-primary/90 shadow-md" onClick={handleSave}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Save Profile
            </Button>
          </div>
        </div>

        <Card className="border-primary/20 shadow-sm bg-primary/5 hidden">
            {/* Hidden original redundant card to keep safe just in case, but actually I will just remove it in the replacement */}
        </Card>

        {/* Keeping the tabs as is */}
        <Tabs defaultValue="identity" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px] h-12 p-1 bg-muted/50 rounded-lg">
            <TabsTrigger value="identity" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md">Identity</TabsTrigger>
            <TabsTrigger value="offerings" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md">Offerings</TabsTrigger>
            <TabsTrigger value="icp" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md">ICP & Market</TabsTrigger>
            <TabsTrigger value="positioning" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md">Positioning</TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Core Identity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <SmartField 
                      label="Legal Name" 
                      field={profile.identity.legalName} 
                      onUpdate={(u) => updateField('identity', 'legalName', u)} 
                    />
                    <SmartField 
                      label="Industry" 
                      field={profile.identity.industry} 
                      onUpdate={(u) => updateField('identity', 'industry', u)} 
                    />
                    <SmartField 
                      label="Headquarters / Regions" 
                      field={profile.identity.regions} 
                      onUpdate={(u) => updateField('identity', 'regions', u)} 
                    />
                    <SmartField 
                      label="Company Size" 
                      field={profile.identity.employees} 
                      onUpdate={(u) => updateField('identity', 'employees', u)} 
                    />
                  </div>
                  <Separator />
                  <SmartField 
                    label="Company Description" 
                    field={profile.identity.description} 
                    onUpdate={(u) => updateField('identity', 'description', u)} 
                    multiline 
                  />
                </CardContent>
              </Card>
              
              <div className="space-y-6">
                <Card className="bg-muted/30">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck className="h-4 w-4" />
                      Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="cursor-pointer" htmlFor="auto-update">Auto-Update Intelligence</Label>
                      <Switch id="auto-update" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="cursor-pointer" htmlFor="human-approval">Require Human Approval</Label>
                      <Switch id="human-approval" defaultChecked />
                    </div>
                    <Separator />
                    <div className="text-xs text-muted-foreground pt-2">
                      Last updated by System AI
                      <br />
                      {new Date().toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="offerings" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Your Offerings & Use Cases
                </CardTitle>
                <CardDescription>
                  Define what you sell and the problems you solve
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <SmartField 
                  label="Core Products/Services" 
                  field={profile.offerings.coreProducts} 
                  onUpdate={(u) => updateField('offerings', 'coreProducts', u)} 
                  multiline
                />
                <div className="grid lg:grid-cols-2 gap-6">
                  <SmartField 
                    label="Primary Use Cases" 
                    field={profile.offerings.useCases} 
                    onUpdate={(u) => updateField('offerings', 'useCases', u)} 
                    multiline
                  />
                  <SmartField 
                    label="Problems Solved" 
                    field={profile.offerings.problemsSolved} 
                    onUpdate={(u) => updateField('offerings', 'problemsSolved', u)} 
                    multiline
                  />
                </div>
                <SmartField 
                  label="Key Differentiators" 
                  field={profile.offerings.differentiators} 
                  onUpdate={(u) => updateField('offerings', 'differentiators', u)} 
                  multiline
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="icp" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
             <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Your ICP & Target Personas
                </CardTitle>
                <CardDescription>
                  Who are you selling to?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  <SmartField 
                    label="Best-fit Industries" 
                    field={profile.icp.industries} 
                    onUpdate={(u) => updateField('icp', 'industries', u)} 
                  />
                  <SmartField 
                    label="Key Personas" 
                    field={profile.icp.personas} 
                    onUpdate={(u) => updateField('icp', 'personas', u)} 
                  />
                </div>
                <SmartField 
                  label="Typical Objections" 
                  field={profile.icp.objections} 
                  onUpdate={(u) => updateField('icp', 'objections', u)} 
                  multiline
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="positioning" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
             <div className="grid lg:grid-cols-2 gap-6">
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Positioning Strategy
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <SmartField 
                    label="One-Liner" 
                    field={profile.positioning.oneLiner} 
                    onUpdate={(u) => updateField('positioning', 'oneLiner', u)} 
                    multiline
                  />
                  <SmartField 
                    label="Top Competitors" 
                    field={profile.positioning.competitors} 
                    onUpdate={(u) => updateField('positioning', 'competitors', u)} 
                  />
                  <SmartField 
                    label="Why Us? (Win themes)" 
                    field={profile.positioning.whyUs} 
                    onUpdate={(u) => updateField('positioning', 'whyUs', u)} 
                    multiline
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Outreach Readiness
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <SmartField 
                    label="Recommended Email Angles" 
                    field={profile.outreach.emailAngles} 
                    onUpdate={(u) => updateField('outreach', 'emailAngles', u)} 
                    multiline
                  />
                  <SmartField 
                    label="Call Opener Variations" 
                    field={profile.outreach.callOpeners} 
                    onUpdate={(u) => updateField('outreach', 'callOpeners', u)} 
                    multiline
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return null;
}
