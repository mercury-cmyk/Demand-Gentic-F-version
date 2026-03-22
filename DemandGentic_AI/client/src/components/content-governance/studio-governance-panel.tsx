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
      
        
        Select an Organization
        Choose an organization above to manage content governance.
      
    );
  }

  return (
    
      
        
          
          Content Governance
        
        
          Feature registry, page health, AI refresh, design governance & version history
        
      

      
        
          
            
               Features
            
            
               Coverage
            
            
               Health
            
            
               Actions
            
            
               Versions
            
          

          
            
          
          
            
          
          
            
          
          
            
          
          
            
          
        
      
    
  );
}