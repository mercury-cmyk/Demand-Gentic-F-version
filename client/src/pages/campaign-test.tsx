import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Bot, Phone, AlertTriangle } from "lucide-react";
import { CampaignTestPanel } from "@/components/campaigns/campaign-test-panel";

interface Campaign {
  id: string;
  name: string;
  status: string;
  type: string;
  dialMode: string;
  aiAgentSettings?: any;
}

export default function CampaignTestPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [, setLocation] = useLocation();

  // Fetch campaign details
  const { data: campaign, isLoading: campaignLoading, error } = useQuery<Campaign>({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
  });

  if (campaignLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Campaign Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The campaign you're looking for doesn't exist or you don't have access to it.
            </p>
            <Button onClick={() => setLocation("/campaigns/phone")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Campaigns
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if this is an AI agent campaign
  if (campaign.dialMode !== "ai_agent") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Not an AI Agent Campaign</h2>
            <p className="text-muted-foreground mb-4">
              Test calls are only available for AI Agent campaigns. This campaign is using "{campaign.dialMode}" mode.
            </p>
            <Button onClick={() => setLocation("/campaigns/phone")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Campaigns
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/campaigns/phone")}
              className="mr-2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-6 w-6" />
              Test AI Agent
            </h1>
            <Badge variant="outline" className="border-purple-500 text-purple-600">
              <Bot className="w-3 h-3 mr-1" />
              AI Agent
            </Badge>
          </div>
          <p className="text-muted-foreground ml-14">
            Test your AI agent with real calls for campaign: <span className="font-medium">{campaign.name}</span>
          </p>
        </div>
        <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
          {campaign.status}
        </Badge>
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Phone className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900 dark:text-blue-100">How Test Calls Work</h3>
              <ul className="text-sm text-blue-700 dark:text-blue-300 mt-2 space-y-1 list-disc list-inside">
                <li>Enter a phone number and contact details to simulate a real call</li>
                <li>The AI agent will call using the campaign's assigned virtual agent</li>
                <li>After the call, you can analyze the transcript for issues</li>
                <li>Get AI-powered suggestions to improve your agent's prompt</li>
                <li>Test calls are logged but do not affect campaign statistics</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Panel Component */}
      <CampaignTestPanel
        campaignId={campaignId!}
        campaignName={campaign.name}
        dialMode={campaign.dialMode}
      />

      {/* AI Agent Info */}
      {campaign.aiAgentSettings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI Agent Configuration</CardTitle>
            <CardDescription>Current agent settings for this campaign</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {campaign.aiAgentSettings.persona && (
                <>
                  <div>
                    <span className="text-muted-foreground">Agent Name:</span>
                    <span className="ml-2 font-medium">{campaign.aiAgentSettings.persona.name || 'Not set'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Company:</span>
                    <span className="ml-2 font-medium">{campaign.aiAgentSettings.persona.companyName || 'Not set'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Voice:</span>
                    <span className="ml-2 font-medium capitalize">{campaign.aiAgentSettings.persona.voice || 'Default'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Role:</span>
                    <span className="ml-2 font-medium">{campaign.aiAgentSettings.persona.role || 'Not set'}</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
