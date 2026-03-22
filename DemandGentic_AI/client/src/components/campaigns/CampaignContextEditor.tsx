import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Target,
  Package,
  ListChecks,
  Users,
  X,
} from "lucide-react";
import { CallFlowEditor } from "@/components/campaigns/CallFlowEditor";
import type { CampaignCallFlow } from "@shared/call-flow";

export interface CampaignContextData {
  campaignObjective: string;
  campaignContextBrief?: string;
  productServiceInfo: string;
  talkingPoints: string[];
  targetAudienceDescription: string;
  successCriteria: string;
  campaignObjections?: Array;
  callFlow?: CampaignCallFlow | null;
}

interface CampaignContextEditorProps {
  data: CampaignContextData;
  onChange: (data: CampaignContextData) => void;
  headerAction?: React.ReactNode;
  campaignType?: string | null;
}

export function CampaignContextEditor({
  data,
  onChange,
  headerAction,
  campaignType,
}: CampaignContextEditorProps) {
  const [newTalkingPoint, setNewTalkingPoint] = useState("");

  const updateField = (field: keyof CampaignContextData, value: any) => {
    onChange({
      ...data,
      [field]: value
    });
  };

  const addTalkingPoint = () => {
    if (newTalkingPoint.trim()) {
      updateField("talkingPoints", [...(data.talkingPoints || []), newTalkingPoint.trim()]);
      setNewTalkingPoint("");
    }
  };

  const removeTalkingPoint = (index: number) => {
    updateField(
      "talkingPoints",
      (data.talkingPoints || []).filter((_, i) => i !== index)
    );
  };

  const addObjection = () => {
    const current = data.campaignObjections || [];
    updateField("campaignObjections", [...current, { objection: "", response: "" }]);
  };

  const removeObjection = (index: number) => {
    const current = data.campaignObjections || [];
    updateField("campaignObjections", current.filter((_, i) => i !== index));
  };

  const updateObjectionItem = (index: number, key: "objection" | "response", val: string) => {
    const current = [...(data.campaignObjections || [])];
    current[index] = { ...current[index], [key]: val };
    updateField("campaignObjections", current);
  };

  return (
    
      
        
          
            
            Campaign Context
          
          {headerAction}
        
        
          Define the campaign goals and context. This information will be displayed to agents during calls
          to help them understand the campaign objectives and have informed conversations.
        
      
      
        {/* Campaign Objective */}
        
          Campaign Objective
           updateField("campaignObjective", e.target.value)}
            rows={2}
            data-testid="textarea-campaign-objective"
          />
          What is the primary goal of each call?
        

        {/* AI Agent Context Brief */}
        
          
            AI Agent Context Brief
            (Recommended)
          
           updateField("campaignContextBrief", e.target.value)}
            rows={4}
            className="bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800"
            data-testid="textarea-campaign-context-brief"
          />
          
            A 3-5 sentence brief that gives the AI voice agent all the context it needs for intelligent conversations.
            Include: who you are, what you offer, why it matters, and what outcome you want.
          
        

        {/* Product/Service Info */}
        
          
            
            Product/Service Information
          
           updateField("productServiceInfo", e.target.value)}
            rows={4}
            data-testid="textarea-product-info"
          />
        

        {/* Key Talking Points */}
        
          
            
            Key Talking Points
          
          
            Add the main points agents should emphasize during conversations.
          
          
            {(data.talkingPoints || []).map((point, index) => (
              
                {point}
                 removeTalkingPoint(index)}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                >
                  
                
              
            ))}
            
               setNewTalkingPoint(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTalkingPoint())}
                data-testid="input-new-talking-point"
              />
              
                
              
            
          
        

        {/* Target Audience */}
        
          
            
            Target Audience
          
           updateField("targetAudienceDescription", e.target.value)}
            rows={2}
            data-testid="textarea-target-audience"
          />
          Who are you trying to reach?
        

        {/* Success Criteria */}
        
          Success Criteria
           updateField("successCriteria", e.target.value)}
            rows={2}
            data-testid="textarea-success-criteria"
          />
          What counts as a successful call outcome?
        

         updateField("callFlow", callFlow)}
        />

        {/* Campaign Objections */}
        
          
            Common Objections & Responses
            
              
              Add Objection
            
          
          
            Prepare agents with responses to common pushback.
          
          
          
            {(data.campaignObjections || []).map((obj, index) => (
              
                
                   removeObjection(index)}
                    className="absolute top-2 right-2 h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  >
                    
                  
                  
                  
                    Objection
                     updateObjectionItem(index, "objection", e.target.value)}
                    />
                  
                  
                  
                    Response Strategy
                     updateObjectionItem(index, "response", e.target.value)}
                      rows={2}
                    />
                  
                
              
            ))}
            {(data.campaignObjections || []).length === 0 && (
              
                No objections defined. Add common objections to help agents handle rejection.
              
            )}
          
        
      
    
  );
}