import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Grid3X3, HeartPulse, ClipboardList, History, Shield } from "lucide-react";
import FeatureRegistryTab from "@/components/content-governance/feature-registry-tab";
import CoverageMatrixTab from "@/components/content-governance/coverage-matrix-tab";
import PageHealthTab from "@/components/content-governance/page-health-tab";
import GovernanceActionsTab from "@/components/content-governance/governance-actions-tab";
import VersionHistoryTab from "@/components/content-governance/version-history-tab";
import { Badge } from "@/components/ui/badge";
import { SUPER_ORG_ID, SUPER_ORG_NAME } from "@shared/schema";

export default function ContentGovernancePage() {
  const organizationId = SUPER_ORG_ID;
  const [activeTab, setActiveTab] = useState("features");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Content Governance
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Admin governance runs against the platform super organization only.
            </p>
          </div>
          <Badge variant="secondary">{SUPER_ORG_NAME} · Super Organization</Badge>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="features" className="gap-1.5">
              <Package className="h-3.5 w-3.5" /> Feature Registry
            </TabsTrigger>
            <TabsTrigger value="coverage" className="gap-1.5">
              <Grid3X3 className="h-3.5 w-3.5" /> Coverage Matrix
            </TabsTrigger>
            <TabsTrigger value="health" className="gap-1.5">
              <HeartPulse className="h-3.5 w-3.5" /> Page Health
            </TabsTrigger>
            <TabsTrigger value="actions" className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" /> Governance Actions
            </TabsTrigger>
            <TabsTrigger value="versions" className="gap-1.5">
              <History className="h-3.5 w-3.5" /> Version History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="features">
            <FeatureRegistryTab organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="coverage">
            <CoverageMatrixTab organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="health">
            <PageHealthTab organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="actions">
            <GovernanceActionsTab organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="versions">
            <VersionHistoryTab organizationId={organizationId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
