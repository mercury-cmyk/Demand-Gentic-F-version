import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountIntelligenceView } from "@/components/ai-studio/account-intelligence/account-intelligence-view";
import { ICPPositioningTab } from "@/components/ai-studio/org-intelligence/tabs/icp-positioning";
import { MessagingProofTab } from "@/components/ai-studio/org-intelligence/tabs/messaging-proof";
import { PromptOptimizationView } from "@/components/ai-studio/org-intelligence/prompt-optimization";
import { ServiceCatalogTab } from "@/components/ai-studio/org-intelligence/tabs/service-catalog-tab";
import { ProblemFrameworkTab } from "@/components/ai-studio/org-intelligence/tabs/problem-framework-tab";
import { Badge } from "@/components/ui/badge";
import { SUPER_ORG_ID, SUPER_ORG_NAME } from "@shared/schema";

export default function OrganizationIntelligencePage() {
  const selectedOrgId = SUPER_ORG_ID;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organization Intelligence</h1>
          <p className="text-muted-foreground mt-2">
            The admin workspace is locked to the platform super organization. Client organizations only use their own intelligence inside client dashboards.
          </p>
        </div>
        <Badge variant="secondary">{SUPER_ORG_NAME} · Super Organization</Badge>
      </div>

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
          <AccountIntelligenceView organizationId={selectedOrgId} />
        </TabsContent>

        <TabsContent value="service-catalog" className="space-y-4">
          <ServiceCatalogTab organizationId={selectedOrgId} />
        </TabsContent>

        <TabsContent value="problem-framework" className="space-y-4">
          <ProblemFrameworkTab organizationId={selectedOrgId} />
        </TabsContent>

        <TabsContent value="icp-positioning" className="space-y-4">
          <ICPPositioningTab organizationId={selectedOrgId} />
        </TabsContent>

        <TabsContent value="messaging-proof" className="space-y-4">
          <MessagingProofTab organizationId={selectedOrgId} />
        </TabsContent>

        <TabsContent value="prompt-optimization" className="space-y-4">
          <PromptOptimizationView organizationId={selectedOrgId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
