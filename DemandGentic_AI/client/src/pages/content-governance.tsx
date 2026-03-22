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
    
      {/* Header */}
      
        
          
            
              
              Content Governance
            
            
              Admin governance runs against the platform super organization only.
            
          
          {SUPER_ORG_NAME} · Super Organization
        
      

      {/* Content */}
      
        
          
            
               Feature Registry
            
            
               Coverage Matrix
            
            
               Page Health
            
            
               Governance Actions
            
            
               Version History
            
          

          
            
          
          
            
          
          
            
          
          
            
          
          
            
          
        
      
    
  );
}