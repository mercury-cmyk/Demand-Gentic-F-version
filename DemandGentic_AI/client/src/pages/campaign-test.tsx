import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Bot, Phone, AlertTriangle } from "lucide-react";
import { CampaignTestPanel } from "@/components/campaigns/campaign-test-panel";

interface Campaign {
  id: string;
  name: string;
  status: string;
  type: string;
  dialMode: string;
  aiAgentSettings?: any;
}

export default function CampaignTestPage() {
  const { campaignId } = useParams();
  const [, setLocation] = useLocation();

  // Fetch campaign details
  const { data: campaign, isLoading: campaignLoading, error } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
  });

  if (campaignLoading) {
    return (
      
        
        
      
    );
  }

  if (error || !campaign) {
    return (
      
        
          
            
            Campaign Not Found
            
              The campaign you're looking for doesn't exist or you don't have access to it.
            
             setLocation("/campaigns/phone")}>
              
              Back to Campaigns
            
          
        
      
    );
  }

  // Check if this is an AI agent campaign
  if (campaign.dialMode !== "ai_agent") {
    return (
      
        
          
            
            Not an AI Agent Campaign
            
              Test calls are only available for AI Agent campaigns. This campaign is using "{campaign.dialMode}" mode.
            
             setLocation("/campaigns/phone")}>
              
              Back to Campaigns
            
          
        
      
    );
  }

  return (
    
      {/* Header */}
      
        
          
             setLocation("/campaigns/phone")}
              className="mr-2"
            >
              
            
            
              
              Test AI Agent
            
            
              
              AI Agent
            
          
          
            Test your AI agent with real calls for campaign: {campaign.name}
          
        
        
          {campaign.status}
        
      

      {/* Info Banner */}
      
        
          
            
            
              How Test Calls Work
              
                Enter a phone number and contact details to simulate a real call
                The AI agent will call using the campaign's assigned virtual agent
                After the call, you can analyze the transcript for issues
                Get AI-powered suggestions to improve your agent's prompt
                Test calls are logged but do not affect campaign statistics
              
            
          
        
      

      {/* Test Panel Component */}
      

      {/* AI Agent Info */}
      {campaign.aiAgentSettings && (
        
          
            AI Agent Configuration
            Current agent settings for this campaign
          
          
            
              {campaign.aiAgentSettings.persona && (
                <>
                  
                    Agent Name:
                    {campaign.aiAgentSettings.persona.name || 'Not set'}
                  
                  
                    Company:
                    {campaign.aiAgentSettings.persona.companyName || 'Not set'}
                  
                  
                    Voice:
                    {campaign.aiAgentSettings.persona.voice || 'Default'}
                  
                  
                    Role:
                    {campaign.aiAgentSettings.persona.role || 'Not set'}
                  
                
              )}
            
          
        
      )}
    
  );
}