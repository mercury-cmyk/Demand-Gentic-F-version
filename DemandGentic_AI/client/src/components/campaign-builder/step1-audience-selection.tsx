import { useState, useEffect } from "react"; // Added useEffect import
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, FileText, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampaignAudienceSelector, type AudienceSelection } from "@/components/campaigns/CampaignAudienceSelector";
import { SUPER_ORG_ID, SUPER_ORG_NAME } from "@shared/schema";

interface Step1Props {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  campaignType: "email" | "telemarketing";
}

// Renamed Step1AudienceSelection to match the original component name and updated prop type.
export function Step1AudienceSelection({ data, onNext, campaignType }: Step1Props) {
  // Campaign Name
  const [campaignName, setCampaignName] = useState(data.name || "");

  // Organization selection for problem intelligence
  const [selectedOrgId, setSelectedOrgId] = useState(SUPER_ORG_ID);

  useEffect(() => {
    if (selectedOrgId !== SUPER_ORG_ID) {
      setSelectedOrgId(SUPER_ORG_ID);
    }
  }, [selectedOrgId]);

  const [audienceData, setAudienceData] = useState({
    source: data.audience?.source || "filters",
    selectedSegments: data.audience?.selectedSegments || [],
    selectedLists: data.audience?.selectedLists || [],
    selectedDomainSets: data.audience?.selectedDomainSets || [],
    excludedSegments: data.audience?.excludedSegments || [],
    excludedLists: data.audience?.excludedLists || [],
    filterGroup: data.audience?.filterGroup,
    estimatedCount: data.audience?.estimatedCount || 0
  });

  const handleNext = () => {
    console.log('Campaign audience data:', audienceData); // Debug log

    onNext({
      name: campaignName,
      organizationId: selectedOrgId,
      audience: audienceData,
    });
  };

  const hasValidAudience = () => {
    const { source, selectedSegments = [], selectedLists = [], selectedDomainSets = [], filterGroup } = audienceData;
    if (source === "segment" && selectedSegments.length > 0) return true;
    if (source === "list" && selectedLists.length > 0) return true;
    if (source === "domain_set" && selectedDomainSets.length > 0) return true;
    if (source === "filters" && filterGroup && filterGroup.conditions.length > 0) return true;
    return false;
  };

  return (
    
      {/* Campaign Name */}
      
        
          
            
            Campaign Name
          
          Give your campaign a descriptive name
        
        
          
            
              Name
               setCampaignName(e.target.value)}
              />
            
            
              
                
                Organization
              
              
                
                {SUPER_ORG_NAME}
                Super Organization
              
              
                Admin campaigns always use the super organization for problem intelligence and service catalog matching
              
            
          
        
      

      

      {/* Next Button */}
      
        
          Continue to Content Setup
          
        
      
    
  );
}