import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AccountIntelligenceView } from "@/components/ai-studio/account-intelligence/account-intelligence-view";
import { ICPPositioningTab } from "@/components/ai-studio/org-intelligence/tabs/icp-positioning";
import { MessagingProofTab } from "@/components/ai-studio/org-intelligence/tabs/messaging-proof";
import { PromptOptimizationView } from "@/components/ai-studio/org-intelligence/prompt-optimization";
import { OrganizationSelector } from "@/components/ai-studio/org-intelligence/organization-selector";
import { ServiceCatalogTab } from "@/components/ai-studio/org-intelligence/tabs/service-catalog-tab";
import { ProblemFrameworkTab } from "@/components/ai-studio/org-intelligence/tabs/problem-framework-tab";

export default function OrganizationIntelligencePage() {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

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

      <OrganizationSelector selectedOrgId={selectedOrgId} onOrgChange={setSelectedOrgId} />

      <Tabs defaultValue="organization-profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto">
          <TabsTrigger value="organization-profile" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-semibold">
            Organization Profile
          </TabsTrigger>
          <TabsTrigger value="service-catalog">Service Catalog</TabsTrigger>
          <TabsTrigger value="problem-framework">Problem Framework</TabsTrigger>
          <TabsTrigger value="icp-positioning">ICP & Positioning</TabsTrigger>
          <TabsTrigger value="messaging-proof">Messaging & Proof</TabsTrigger>
          <TabsTrigger value="prompt-optimization">Prompt & Training</TabsTrigger>
        </TabsList>

        <TabsContent value="organization-profile" className="space-y-4">
          <AccountIntelligenceView />
        </TabsContent>

        <TabsContent value="service-catalog" className="space-y-4">
          <ServiceCatalogTab organizationId={selectedOrgId} />
        </TabsContent>

        <TabsContent value="problem-framework" className="space-y-4">
          <ProblemFrameworkTab organizationId={selectedOrgId} />
        </TabsContent>

        <TabsContent value="icp-positioning" className="space-y-4">
          <ICPPositioningTab />
        </TabsContent>

        <TabsContent value="messaging-proof" className="space-y-4">
          <MessagingProofTab />
        </TabsContent>

        <TabsContent value="prompt-optimization" className="space-y-4">
          <PromptOptimizationView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
