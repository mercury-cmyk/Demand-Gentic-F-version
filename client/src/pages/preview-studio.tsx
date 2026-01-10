import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import {
  Eye,
  FileText,
  Phone,
  MessageSquare,
  RefreshCw,
  Download,
  Brain,
  Building2,
  User,
  Megaphone
} from "lucide-react";
import { ContextSelectorPanel } from "@/components/preview-studio/context-selector-panel";
import { CallPlanPanel } from "@/components/preview-studio/call-plan-panel";
import { PromptInspectorPanel } from "@/components/preview-studio/prompt-inspector-panel";
import { LiveSimulationPanel } from "@/components/preview-studio/live-simulation-panel";

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
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("call-plan");

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

  const hasRequiredSelection = selectedCampaignId && selectedAccountId;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Eye className="h-6 w-6" />
              Preview Studio
            </h1>
            <p className="text-sm text-muted-foreground">
              Preview and test campaign content before live execution
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={!hasRequiredSelection || contextLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${contextLoading ? 'animate-spin' : ''}`} />
              Regenerate
            </Button>
            <Button variant="outline" size="sm" disabled={!previewContext}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Context Selector */}
        <div className="w-80 border-r bg-muted/30 overflow-y-auto">
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
            <div className="flex-1 flex items-center justify-center">
              <Card className="max-w-md">
                <CardContent className="py-12 text-center">
                  <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h2 className="text-xl font-semibold mb-2">Select Context to Preview</h2>
                  <p className="text-muted-foreground">
                    Choose a campaign and account from the sidebar to preview how account intelligence shapes AI behavior.
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <div className="border-b px-6 py-2">
                <TabsList>
                  <TabsTrigger value="call-plan" className="gap-2">
                    <Phone className="h-4 w-4" />
                    Call Plan
                  </TabsTrigger>
                  <TabsTrigger value="simulation" className="gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Live Simulation
                  </TabsTrigger>
                  <TabsTrigger value="prompts" className="gap-2">
                    <Brain className="h-4 w-4" />
                    Prompts
                  </TabsTrigger>
                  <TabsTrigger value="email" className="gap-2" disabled>
                    <FileText className="h-4 w-4" />
                    Email
                    <Badge variant="outline" className="ml-1 text-xs">Soon</Badge>
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="call-plan" className="h-full m-0 p-6 overflow-y-auto">
                  <CallPlanPanel
                    campaignId={selectedCampaignId}
                    accountId={selectedAccountId}
                    contactId={selectedContactId}
                    previewContext={previewContext}
                    isLoading={contextLoading}
                  />
                </TabsContent>

                <TabsContent value="simulation" className="h-full m-0 p-6 overflow-y-auto">
                  <LiveSimulationPanel
                    campaignId={selectedCampaignId}
                    accountId={selectedAccountId}
                    contactId={selectedContactId}
                  />
                </TabsContent>

                <TabsContent value="prompts" className="h-full m-0 p-6 overflow-y-auto">
                  <PromptInspectorPanel
                    campaignId={selectedCampaignId}
                    accountId={selectedAccountId}
                    contactId={selectedContactId}
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
