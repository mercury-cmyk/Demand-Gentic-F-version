import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ComplianceRules } from "@/components/ai-studio/org-intelligence/compliance-rules";
import { AccountIntelligenceView } from "@/components/ai-studio/account-intelligence/account-intelligence-view";
import { ICPPositioningTab } from "@/components/ai-studio/org-intelligence/tabs/icp-positioning";
import { MessagingProofTab } from "@/components/ai-studio/org-intelligence/tabs/messaging-proof";
import { PromptOptimizationView } from "@/components/ai-studio/org-intelligence/prompt-optimization";
import { TrainingCenterTab } from "@/components/ai-studio/org-intelligence/tabs/training-center";

export default function OrganizationIntelligencePage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organization Intelligence</h1>
          <p className="text-muted-foreground mt-2">
            The foundation layer for all AI behavior - teaching the AI how your organization thinks and operates.
          </p>
        </div>
        <Button>Update Knowledge Base</Button>
      </div>

      <Tabs defaultValue="organization-profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto">
          <TabsTrigger value="organization-profile" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-semibold">
            ⭐ Organization Profile
          </TabsTrigger>
          <TabsTrigger value="icp-positioning">ICP & Positioning</TabsTrigger>
          <TabsTrigger value="messaging-proof">Messaging & Proof</TabsTrigger>
          <TabsTrigger value="compliance-guardrails">Compliance & Guardrails</TabsTrigger>
          <TabsTrigger value="prompt-optimization">Prompt Optimization</TabsTrigger>
          <TabsTrigger value="training-center">Training Center</TabsTrigger>
        </TabsList>

        <TabsContent value="organization-profile" className="space-y-4">
          <AccountIntelligenceView />
        </TabsContent>

        <TabsContent value="icp-positioning" className="space-y-4">
          <ICPPositioningTab />
        </TabsContent>

        <TabsContent value="messaging-proof" className="space-y-4">
          <MessagingProofTab />
        </TabsContent>

        <TabsContent value="compliance-guardrails" className="space-y-4">
          <ComplianceRules />
        </TabsContent>

        <TabsContent value="prompt-optimization" className="space-y-4">
          <PromptOptimizationView />
        </TabsContent>

        <TabsContent value="training-center" className="space-y-4">
          <TrainingCenterTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
