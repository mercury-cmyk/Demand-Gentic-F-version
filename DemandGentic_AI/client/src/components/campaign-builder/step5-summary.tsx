import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Rocket,
  Save,
  Mail,
  Users,
  Calendar,
  Shield,
  Eye,
  Send,
  Bot,
  Target
} from "lucide-react";
import { getEnabledCallFlowSteps, normalizeCampaignCallFlow } from "@shared/call-flow";

interface Step5Props {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  campaignType: "email" | "telemarketing";
}

export function Step5Summary({ data, onNext, campaignType }: Step5Props) {
  const [isLaunching, setIsLaunching] = useState(false);
  const enabledCallFlowSteps = getEnabledCallFlowSteps(
    normalizeCampaignCallFlow(data.callFlow, data.type),
  );

  const handleLaunch = () => {
    setIsLaunching(true);
    onNext({ ...data, action: "launch" });
  };

  const handleSaveDraft = () => {
    onNext({ ...data, action: "draft" });
  };

  const handleSendTest = () => {
    // Test send logic
    alert(campaignType === "email" ? "Test email sent!" : "Test call initiated!");
  };

  return (
    
      {/* Campaign Summary Header */}
      
        
          
            
              
                {campaignType === "email" ? "Email Campaign Summary" : "Telemarketing Campaign Summary"}
              
              Review all settings before launching
            
            
              Ready to Launch
            
          
        
      

      {/* Campaign Name */}
      
        
          Campaign Name
        
        
          {data.name || "Untitled Campaign"}
        
      

      {/* Audience Summary */}
      
        
          
            
            Audience
          
        
        
          
            Source
            {data.audience?.source?.replace('_', ' ') || "Advanced Filters"}
          
          
          {data.audience?.selectedSegments && data.audience.selectedSegments.length > 0 && (
            
              Selected Segments
              
                {data.audience.selectedSegments.map((id: string, idx: number) => (
                  Segment {idx + 1}
                ))}
              
            
          )}

          {data.audience?.selectedLists && data.audience.selectedLists.length > 0 && (
            
              Selected Lists
              
                {data.audience.selectedLists.map((id: string, idx: number) => (
                  List {idx + 1}
                ))}
              
            
          )}

          {data.audience?.filterGroup && data.audience.filterGroup.conditions.length > 0 && (
            
              Additional Filters
              
                {data.audience.filterGroup.conditions.length} condition(s)
                {data.audience.filterGroup.logic}
              
            
          )}

          {(data.audience?.excludedSegments?.length > 0 || data.audience?.excludedLists?.length > 0) && (
            
              Exclusions
              
                {data.audience.excludedSegments?.map((id: string, idx: number) => (
                  Segment {idx + 1}
                ))}
                {data.audience.excludedLists?.map((id: string, idx: number) => (
                  List {idx + 1}
                ))}
              
            
          )}

          
            Estimated Contacts
            {data.audience?.estimatedCount?.toLocaleString() || '0'}
          
          
            After Suppression
            {Math.floor((data.audience?.estimatedCount || 0) * 0.95).toLocaleString()}
          
          
            Excluded (Invalid)
            {Math.floor((data.audience?.estimatedCount || 0) * 0.05).toLocaleString()}
          
        
      

      {/* Content Summary */}
      
        
          
            {campaignType === "email" ? (
              <>
                
                Email Content
              
            ) : (
              <>
                
                AI Agent Configuration
              
            )}
          
        
        
          {campaignType === "email" ? (
            <>
              
                From
                {data.content?.fromName || "Your Company"} &lt;{data.content?.fromEmail || "hello@company.com"}&gt;
              
              
                Subject
                {data.content?.subject || "Your personalized email"}
              
              
                Editor Mode
                {data.content?.editorMode || "design"}
              
            
          ) : (
            <>
              
                AI Context Mode
                
                  Foundation + Campaign Layer
                
              
              
                Qualification Questions
                {data.content?.qualificationFields?.length || 0} questions
              
              
                AI agents use Foundation capabilities combined with Campaign context for intelligent conversations.
              
            
          )}
          {campaignType === "email" && (
            
              
              Preview Email
            
          )}
        
      

      {/* Campaign Context Summary (Telemarketing Only) */}
      {campaignType === "telemarketing" && (data.campaignObjective || data.productServiceInfo || data.talkingPoints?.length > 0) && (
        
          
            
              
              Campaign Context
            
            
              This context will be displayed to agents during calls
            
          
          
            {data.campaignObjective && (
              
                Objective
                {data.campaignObjective}
              
            )}
            {data.productServiceInfo && (
              
                Product/Service
                {data.productServiceInfo}
              
            )}
            {data.talkingPoints && data.talkingPoints.length > 0 && (
              
                Talking Points
                
                  {data.talkingPoints.map((point: string, idx: number) => (
                    
                      {point}
                    
                  ))}
                
              
            )}
            {data.targetAudienceDescription && (
              
                Target Audience
                {data.targetAudienceDescription}
              
            )}
            {data.successCriteria && (
              
                Success Criteria
                {data.successCriteria}
              
            )}
            {enabledCallFlowSteps.length > 0 && (
              
                Call Flow
                
                  {enabledCallFlowSteps.map((step, idx) => (
                    
                      {idx + 1}. {step.label}
                    
                  ))}
                
              
            )}
          
        
      )}

      {/* Scheduling Summary */}
      
        
          
            
            Schedule & Pacing
          
        
        
          {campaignType === "email" ? (
            <>
              
                Timing
                
                  {data.scheduling?.type === "now" ? "Send Immediately" : `Scheduled: ${data.scheduling?.date} ${data.scheduling?.time}`}
                
              
              
                Timezone
                {data.scheduling?.timezone || "UTC"}
              
              
                Throttling
                {data.scheduling?.throttle || "100"} emails/minute
              
            
          ) : (
            <>
              
                Business Hours
                9:00 AM - 6:00 PM
              
              
                Timezone
                
                  Contact's Local Time
                
              
              
                Calls will be placed based on each contact's country and location data.
              
            
          )}
        
      

      {/* Compliance Summary */}
      
        
          
            
            Compliance Status
          
        
        
          
            
              
              All Checks Passed
            
            
              {data.compliance?.checks?.length || 5} / {data.compliance?.checks?.length || 5} Passed
            
          
        
      

      {/* Account Lead Cap (Telemarketing Only) */}
      {campaignType === "telemarketing" && data.accountCap?.enabled && (
        
          
            
              
              Account Lead Cap
            
          
          
            
              Cap Status
              
                Enabled
              
            
            
              Leads Per Account
              {data.accountCap.leadsPerAccount}
            
            
              Enforcement Mode
              
                {data.accountCap.mode === 'queue_size' && 'Queue Size'}
                {data.accountCap.mode === 'connected_calls' && 'Connected Calls'}
                {data.accountCap.mode === 'positive_disp' && 'Positive Dispositions'}
              
            
            
              
                Cap Protection Active
                
                  {data.accountCap.mode === 'queue_size' && `Each account will have a maximum of ${data.accountCap.leadsPerAccount} contact(s) in the calling queue.`}
                  {data.accountCap.mode === 'connected_calls' && `Calling will stop after ${data.accountCap.leadsPerAccount} successful connection(s) per account.`}
                  {data.accountCap.mode === 'positive_disp' && `Calling will stop after ${data.accountCap.leadsPerAccount} positive outcome(s) per account.`}
                
              
            
          
        
      )}

      {/* Action Buttons */}
      
        
          
          {campaignType === "email" ? "Send Test Email" : "Make Test Call"}
        

        
          
          Save as Draft
        

        
          
          {isLaunching ? "Launching..." : "Launch Campaign"}
        
      

      {/* Launch Notice */}
      
        
          
          
            Ready to Launch
            
              Once launched, you'll be able to monitor campaign progress in real-time from the campaigns dashboard.
              {campaignType === "telemarketing" && " Agents will see their assigned calling queue immediately."}
            
          
        
      
    
  );
}