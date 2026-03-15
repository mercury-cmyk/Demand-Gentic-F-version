import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Grid3X3, HeartPulse, ClipboardList, History, ShieldCheck } from "lucide-react";
import FeatureRegistryTab from "./feature-registry-tab";
import CoverageMatrixTab from "./coverage-matrix-tab";
import PageHealthTab from "./page-health-tab";
import GovernanceActionsTab from "./governance-actions-tab";
import VersionHistoryTab from "./version-history-tab";

interface StudioGovernancePanelProps {
  organizationId?: string;
}

export default function StudioGovernancePanel({ organizationId }: StudioGovernancePanelProps) {
  const [activeTab, setActiveTab] = useState("features");

  if (!organizationId) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground">
        <ShieldCheck className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-lg font-medium">Select an Organization</p>
        <p className="text-sm mt-1">Choose an organization above to manage content governance.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4" />
          Content Governance
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Feature registry, page health, AI refresh, design governance & version history
        </p>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-3 mt-2">
            <TabsTrigger value="features" className="gap-1 text-xs">
              <Package className="h-3 w-3" /> Features
            </TabsTrigger>
            <TabsTrigger value="coverage" className="gap-1 text-xs">
              <Grid3X3 className="h-3 w-3" /> Coverage
            </TabsTrigger>
            <TabsTrigger value="health" className="gap-1 text-xs">
              <HeartPulse className="h-3 w-3" /> Health
            </TabsTrigger>
            <TabsTrigger value="actions" className="gap-1 text-xs">
              <ClipboardList className="h-3 w-3" /> Actions
            </TabsTrigger>
            <TabsTrigger value="versions" className="gap-1 text-xs">
              <History className="h-3 w-3" /> Versions
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
