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
    
      
        
          Organization Intelligence
          
            The admin workspace is locked to the platform super organization. Client organizations only use their own intelligence inside client dashboards.
          
        
        {SUPER_ORG_NAME} · Super Organization
      

      
        
          
            Organization Profile
          
          Service Catalog
          Problem Framework
          ICP & Positioning
          Messaging & Proof
          Prompt & Training
        

        
          
        

        
          
        

        
          
        

        
          
        

        
          
        

        
          
        
      
    
  );
}