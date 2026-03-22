import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CampaignSuppressionManager } from "@/components/campaign-suppression-manager";
import { Skeleton } from "@/components/ui/skeleton";
import type { Campaign } from "@shared/schema";

export default function CampaignSuppressionsPage() {
  const [, params] = useRoute("/campaigns/:id/suppressions");
  const campaignId = params?.id;

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['/api/campaigns', campaignId],
    enabled: !!campaignId,
  });

  if (isLoading) {
    return (
      
        
          
          
            
            
          
        
        
      
    );
  }

  if (!campaign) {
    return (
      
        
          
            Campaign Not Found
            
              The requested campaign could not be found.
            
          
        
      
    );
  }

  return (
    
      {/* Header */}
      
        
          
            
          
        
        
          {campaign.name}
          
            Manage campaign-level suppressions: emails, accounts, domains, and contacts
          
        
      

      {/* Suppression Manager */}
      {campaignId && }
    
  );
}