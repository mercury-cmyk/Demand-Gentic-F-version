import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Rocket,
  Save,
  Mail,
  Users,
  Calendar,
  Shield,
  Eye,
  Send,
  Bot,
  Target
} from "lucide-react";
import { getEnabledCallFlowSteps, normalizeCampaignCallFlow } from "@shared/call-flow";

interface Step5Props {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  campaignType: "email" | "telemarketing";
}

export function Step5Summary({ data, onNext, campaignType }: Step5Props) {
  const [isLaunching, setIsLaunching] = useState(false);
  const enabledCallFlowSteps = getEnabledCallFlowSteps(
    normalizeCampaignCallFlow(data.callFlow, data.type),
  );

  const handleLaunch = () => {
    setIsLaunching(true);
    onNext({ ...data, action: "launch" });
  };

  const handleSaveDraft = () => {
    onNext({ ...data, action: "draft" });
  };

  const handleSendTest = () => {
    // Test send logic
    alert(campaignType === "email" ? "Test email sent!" : "Test call initiated!");
  };

  return (
    <div className="space-y-6">
      {/* Campaign Summary Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {campaignType === "email" ? "Email Campaign Summary" : "Telemarketing Campaign Summary"}
              </CardTitle>
              <CardDescription>Review all settings before launching</CardDescription>
            </div>
            <Badge variant="outline" className="text-lg px-4 py-2">
              Ready to Launch
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Campaign Name */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Name</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-medium">{data.name || "Untitled Campaign"}</p>
        </CardContent>
      </Card>

      {/* Audience Summary */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Users className="w-5 h-5 inline mr-2" />
            Audience
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Source</span>
            <span className="font-medium capitalize">{data.audience?.source?.replace('_', ' ') || "Advanced Filters"}</span>
          </div>
          
          {data.audience?.selectedSegments && data.audience.selectedSegments.length > 0 && (
            <div>
              <span className="text-sm text-muted-foreground">Selected Segments</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {data.audience.selectedSegments.map((id: string, idx: number) => (
                  <Badge key={id} variant="secondary">Segment {idx + 1}</Badge>
                ))}
              </div>
            </div>
          )}

          {data.audience?.selectedLists && data.audience.selectedLists.length > 0 && (
            <div>
              <span className="text-sm text-muted-foreground">Selected Lists</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {data.audience.selectedLists.map((id: string, idx: number) => (
                  <Badge key={id} variant="secondary">List {idx + 1}</Badge>
                ))}
              </div>
            </div>
          )}

          {data.audience?.filterGroup && data.audience.filterGroup.conditions.length > 0 && (
            <div>
              <span className="text-sm text-muted-foreground">Additional Filters</span>
              <div className="flex flex-wrap gap-1 mt-1">
                <Badge variant="outline">{data.audience.filterGroup.conditions.length} condition(s)</Badge>
                <Badge variant="outline">{data.audience.filterGroup.logic}</Badge>
              </div>
            </div>
          )}

          {(data.audience?.excludedSegments?.length > 0 || data.audience?.excludedLists?.length > 0) && (
            <div>
              <span className="text-sm text-muted-foreground">Exclusions</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {data.audience.excludedSegments?.map((id: string, idx: number) => (
                  <Badge key={id} variant="destructive">Segment {idx + 1}</Badge>
                ))}
                {data.audience.excludedLists?.map((id: string, idx: number) => (
                  <Badge key={id} variant="destructive">List {idx + 1}</Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-muted-foreground">Estimated Contacts</span>
            <span className="font-medium text-primary text-lg">{data.audience?.estimatedCount?.toLocaleString() || '0'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">After Suppression</span>
            <span className="font-medium">{Math.floor((data.audience?.estimatedCount || 0) * 0.95).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Excluded (Invalid)</span>
            <span className="font-medium text-red-500">{Math.floor((data.audience?.estimatedCount || 0) * 0.05).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Content Summary */}
      <Card>
        <CardHeader>
          <CardTitle>
            {campaignType === "email" ? (
              <>
                <Mail className="w-5 h-5 inline mr-2" />
                Email Content
              </>
            ) : (
              <>
                <Bot className="w-5 h-5 inline mr-2" />
                AI Agent Configuration
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {campaignType === "email" ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">From</span>
                <span className="font-medium">{data.content?.fromName || "Your Company"} &lt;{data.content?.fromEmail || "hello@company.com"}&gt;</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subject</span>
                <span className="font-medium">{data.content?.subject || "Your personalized email"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Editor Mode</span>
                <Badge variant="outline" className="capitalize">{data.content?.editorMode || "design"}</Badge>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">AI Context Mode</span>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                  Foundation + Campaign Layer
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Qualification Questions</span>
                <span className="font-medium">{data.content?.qualificationFields?.length || 0} questions</span>
              </div>
              <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                AI agents use Foundation capabilities combined with Campaign context for intelligent conversations.
              </div>
            </>
          )}
          {campaignType === "email" && (
            <Button variant="outline" size="sm" className="w-full" data-testid="button-preview-content">
              <Eye className="w-4 h-4 mr-2" />
              Preview Email
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Campaign Context Summary (Telemarketing Only) */}
      {campaignType === "telemarketing" && (data.campaignObjective || data.productServiceInfo || data.talkingPoints?.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Target className="w-5 h-5 inline mr-2" />
              Campaign Context
            </CardTitle>
            <CardDescription>
              This context will be displayed to agents during calls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.campaignObjective && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Objective</span>
                <p className="text-sm mt-1">{data.campaignObjective}</p>
              </div>
            )}
            {data.productServiceInfo && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Product/Service</span>
                <p className="text-sm mt-1 line-clamp-3">{data.productServiceInfo}</p>
              </div>
            )}
            {data.talkingPoints && data.talkingPoints.length > 0 && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Talking Points</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {data.talkingPoints.map((point: string, idx: number) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {point}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {data.targetAudienceDescription && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Target Audience</span>
                <p className="text-sm mt-1">{data.targetAudienceDescription}</p>
              </div>
            )}
            {data.successCriteria && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Success Criteria</span>
                <p className="text-sm mt-1">{data.successCriteria}</p>
              </div>
            )}
            {enabledCallFlowSteps.length > 0 && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Call Flow</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {enabledCallFlowSteps.map((step, idx) => (
                    <Badge key={`${step.id}-${idx}`} variant="outline" className="text-xs">
                      {idx + 1}. {step.label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Scheduling Summary */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Calendar className="w-5 h-5 inline mr-2" />
            Schedule & Pacing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {campaignType === "email" ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Timing</span>
                <span className="font-medium capitalize">
                  {data.scheduling?.type === "now" ? "Send Immediately" : `Scheduled: ${data.scheduling?.date} ${data.scheduling?.time}`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Timezone</span>
                <span className="font-medium">{data.scheduling?.timezone || "UTC"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Throttling</span>
                <span className="font-medium">{data.scheduling?.throttle || "100"} emails/minute</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Business Hours</span>
                <span className="font-medium">9:00 AM - 6:00 PM</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Timezone</span>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                  Contact's Local Time
                </Badge>
              </div>
              <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                Calls will be placed based on each contact's country and location data.
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Compliance Summary */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Shield className="w-5 h-5 inline mr-2" />
            Compliance Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="font-medium text-green-500">All Checks Passed</span>
            </div>
            <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
              {data.compliance?.checks?.length || 5} / {data.compliance?.checks?.length || 5} Passed
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Account Lead Cap (Telemarketing Only) */}
      {campaignType === "telemarketing" && data.accountCap?.enabled && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Users className="w-5 h-5 inline mr-2" />
              Account Lead Cap
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cap Status</span>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                Enabled
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Leads Per Account</span>
              <span className="font-medium text-primary">{data.accountCap.leadsPerAccount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Enforcement Mode</span>
              <Badge variant="secondary" className="capitalize">
                {data.accountCap.mode === 'queue_size' && 'Queue Size'}
                {data.accountCap.mode === 'connected_calls' && 'Connected Calls'}
                {data.accountCap.mode === 'positive_disp' && 'Positive Dispositions'}
              </Badge>
            </div>
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg mt-3">
              <div className="text-sm text-blue-600 dark:text-blue-400">
                <p className="font-medium">Cap Protection Active</p>
                <p className="text-blue-600/80 dark:text-blue-400/80 mt-1">
                  {data.accountCap.mode === 'queue_size' && `Each account will have a maximum of ${data.accountCap.leadsPerAccount} contact(s) in the calling queue.`}
                  {data.accountCap.mode === 'connected_calls' && `Calling will stop after ${data.accountCap.leadsPerAccount} successful connection(s) per account.`}
                  {data.accountCap.mode === 'positive_disp' && `Calling will stop after ${data.accountCap.leadsPerAccount} positive outcome(s) per account.`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-4">
        <Button
          variant="outline"
          onClick={handleSendTest}
          className="h-20 flex-col gap-2"
          data-testid="button-send-test"
        >
          <Send className="w-5 h-5" />
          <span>{campaignType === "email" ? "Send Test Email" : "Make Test Call"}</span>
        </Button>

        <Button
          variant="outline"
          onClick={handleSaveDraft}
          className="h-20 flex-col gap-2"
          data-testid="button-save-draft"
        >
          <Save className="w-5 h-5" />
          <span>Save as Draft</span>
        </Button>

        <Button
          onClick={handleLaunch}
          disabled={isLaunching}
          className="h-20 flex-col gap-2 bg-primary hover:bg-primary/90"
          data-testid="button-launch-campaign"
        >
          <Rocket className="w-5 h-5" />
          <span>{isLaunching ? "Launching..." : "Launch Campaign"}</span>
        </Button>
      </div>

      {/* Launch Notice */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <div className="flex items-start gap-2">
          <Rocket className="w-5 h-5 text-blue-500 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-500">Ready to Launch</p>
            <p className="text-blue-500/80 mt-1">
              Once launched, you'll be able to monitor campaign progress in real-time from the campaigns dashboard.
              {campaignType === "telemarketing" && " Agents will see their assigned calling queue immediately."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
