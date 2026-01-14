import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import {
  Eye,
  FileText,
  Phone,
  PhoneCall,
  MessageSquare,
  RefreshCw,
  Download,
  Brain,
  Building2,
  User,
  Megaphone,
  Sparkles,
  Target,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import { ContextSelectorPanel } from "@/components/preview-studio/context-selector-panel";
import { CallPlanPanel } from "@/components/preview-studio/call-plan-panel";
import { PromptInspectorPanel } from "@/components/preview-studio/prompt-inspector-panel";
import { LiveSimulationPanel } from "@/components/preview-studio/live-simulation-panel";
import { TextSimulationPanel } from "@/components/preview-studio/text-simulation-panel";
import { CallAnalysisPanel } from "@/components/preview-studio/call-analysis-panel";
import type { EvaluationReport } from "@/types/call-analysis";

interface PreviewContext {
  sessionId: string;
  accountIntelligence: any;
  accountMessagingBrief: any;
  accountCallBrief: any;
  participantCallPlan: any;
  participantContext: any;
  account: { id: string; name: string; domain: string | null; industry: string | null } | null;
  contact: { id: string; fullName: string | null; jobTitle: string | null; email: string | null } | null;
  campaign: { id: string; name: string | null; type: string | null } | null;
}

export default function PreviewStudioPage() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const campaignIdFromUrl = urlParams.get('campaignId');

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(campaignIdFromUrl);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("text-simulation");
  const [analysisReport, setAnalysisReport] = useState<EvaluationReport | null>(null);
  const [analysisSource, setAnalysisSource] = useState<'phone' | 'text' | null>(null);

  // Update selected campaign if URL changes
  useEffect(() => {
    if (campaignIdFromUrl && campaignIdFromUrl !== selectedCampaignId) {
      setSelectedCampaignId(campaignIdFromUrl);
    }
  }, [campaignIdFromUrl]);

  // Fetch preview context when selections are made
  const { data: previewContext, isLoading: contextLoading, refetch: refetchContext } = useQuery<PreviewContext>({
    queryKey: ['/api/preview-studio/context', selectedCampaignId, selectedAccountId, selectedContactId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaignId) params.set('campaignId', selectedCampaignId);
      if (selectedAccountId) params.set('accountId', selectedAccountId);
      if (selectedContactId) params.set('contactId', selectedContactId);

      const response = await apiRequest('GET', `/api/preview-studio/context?${params.toString()}`);
      return response.json();
    },
    enabled: !!(selectedCampaignId && selectedAccountId),
  });

  const handleSelectionChange = (selection: { campaignId: string | null; accountId: string | null; contactId: string | null }) => {
    setSelectedCampaignId(selection.campaignId);
    setSelectedAccountId(selection.accountId);
    setSelectedContactId(selection.contactId);
  };

  const handleRegenerate = () => {
    refetchContext();
  };

  // Handle analysis from text simulation
  const handleTextSimulationAnalysis = useCallback((report: EvaluationReport) => {
    setAnalysisReport(report);
    setAnalysisSource('text');
    setActiveTab('analysis');
  }, []);

  // Handle analysis from phone call
  const handlePhoneCallAnalysis = useCallback((report: EvaluationReport) => {
    setAnalysisReport(report);
    setAnalysisSource('phone');
    setActiveTab('analysis');
  }, []);

  const hasRequiredSelection = selectedCampaignId && selectedAccountId;

  // Calculate context readiness
  const contextItems = [
    { label: 'Campaign', ready: !!selectedCampaignId, icon: Megaphone },
    { label: 'Account', ready: !!selectedAccountId, icon: Building2 },
    { label: 'Contact', ready: !!selectedContactId, icon: User, optional: true },
    { label: 'Intelligence', ready: !!previewContext?.accountIntelligence, icon: Brain },
  ];

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-background to-muted/20">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                Preview Studio
              </h1>
              <p className="text-sm text-muted-foreground">
                Test and validate AI agent behavior before going live
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={!hasRequiredSelection || contextLoading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${contextLoading ? 'animate-spin' : ''}`} />
                Refresh Context
              </Button>
            </div>
          </div>

          {/* Context Status Bar */}
          {hasRequiredSelection && (
            <div className="flex items-center gap-4 mt-4 pt-4 border-t">
              <span className="text-sm font-medium text-muted-foreground">Context:</span>
              <div className="flex items-center gap-3">
                {contextItems.map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-1.5 text-sm ${
                      item.ready
                        ? 'text-foreground'
                        : item.optional
                          ? 'text-muted-foreground/50'
                          : 'text-yellow-600 dark:text-yellow-500'
                    }`}
                  >
                    {item.ready ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <span>{item.label}</span>
                    {item.optional && !item.ready && (
                      <span className="text-xs">(optional)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Context Selector */}
        <div className="w-80 border-r bg-background/50 overflow-y-auto">
          <div className="p-4 border-b bg-muted/30">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Test Context
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Select campaign, account, and contact to preview
            </p>
          </div>
          <ContextSelectorPanel
            selectedCampaignId={selectedCampaignId}
            selectedAccountId={selectedAccountId}
            selectedContactId={selectedContactId}
            onSelectionChange={handleSelectionChange}
            previewContext={previewContext}
            isLoading={contextLoading}
          />
        </div>

        {/* Main Preview Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!hasRequiredSelection ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <Card className="max-w-lg border-2 border-dashed">
                <CardContent className="py-16 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-2xl font-semibold mb-3">Welcome to Preview Studio</h2>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    Select a campaign and account from the sidebar to preview AI agent behavior
                    and test with real phone calls.
                  </p>
                  <div className="flex flex-col gap-2 text-sm text-left max-w-xs mx-auto">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary font-bold">1</span>
                      </div>
                      <span>Select a campaign and account</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary font-bold">2</span>
                      </div>
                      <span>Review call plan and prompts</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary font-bold">3</span>
                      </div>
                      <span>Make a test call to validate</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <div className="border-b px-6 py-2 bg-background/50">
                <TabsList className="h-11">
                  <TabsTrigger value="text-simulation" className="gap-2 px-4">
                    <MessageSquare className="h-4 w-4" />
                    Text Simulation
                    <Badge variant="secondary" className="ml-1 text-xs">Free</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="simulation" className="gap-2 px-4">
                    <PhoneCall className="h-4 w-4" />
                    Live Testing
                    <Badge variant="outline" className="ml-1 text-xs">Real Call</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="call-plan" className="gap-2 px-4">
                    <Phone className="h-4 w-4" />
                    Call Plan
                  </TabsTrigger>
                  <TabsTrigger value="prompts" className="gap-2 px-4">
                    <Brain className="h-4 w-4" />
                    Prompts
                  </TabsTrigger>
                  <TabsTrigger value="analysis" className="gap-2 px-4">
                    <BarChart3 className="h-4 w-4" />
                    Analysis
                    {analysisReport && (
                      <Badge variant={analysisReport.executiveSummary.verdict === 'approve' ? 'default' : analysisReport.executiveSummary.verdict === 'reject' ? 'destructive' : 'secondary'} className="ml-1 text-xs">
                        {analysisReport.scorecard.total}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="email" className="gap-2 px-4" disabled>
                    <FileText className="h-4 w-4" />
                    Email
                    <Badge variant="outline" className="ml-1 text-xs">Soon</Badge>
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="text-simulation" className="h-full m-0 p-6 overflow-y-auto">
                  <TextSimulationPanel
                    campaignId={selectedCampaignId}
                    accountId={selectedAccountId}
                    contactId={selectedContactId}
                    onAnalysisReady={handleTextSimulationAnalysis}
                  />
                </TabsContent>
                
                <TabsContent value="simulation" className="h-full m-0 p-6 overflow-y-auto">
                  <LiveSimulationPanel
                    campaignId={selectedCampaignId}
                    accountId={selectedAccountId}
                    contactId={selectedContactId}
                    onAnalysisReady={handlePhoneCallAnalysis}
                  />
                </TabsContent>

                <TabsContent value="call-plan" className="h-full m-0 p-6 overflow-y-auto">
                  <CallPlanPanel
                    campaignId={selectedCampaignId}
                    accountId={selectedAccountId}
                    contactId={selectedContactId}
                    previewContext={previewContext}
                    isLoading={contextLoading}
                  />
                </TabsContent>

                <TabsContent value="prompts" className="h-full m-0 p-6 overflow-y-auto">
                  <PromptInspectorPanel
                    campaignId={selectedCampaignId}
                    accountId={selectedAccountId}
                    contactId={selectedContactId}
                  />
                </TabsContent>

                <TabsContent value="analysis" className="h-full m-0 p-6 overflow-y-auto">
                  <CallAnalysisPanel
                    report={analysisReport}
                    source={analysisSource}
                  />
                </TabsContent>

                <TabsContent value="email" className="h-full m-0 p-6 overflow-y-auto">
                  <Card>
                    <CardContent className="py-12 text-center">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h2 className="text-xl font-semibold mb-2">Email Preview Coming Soon</h2>
                      <p className="text-muted-foreground">
                        Email preview with sequence timeline will be available in a future update.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
