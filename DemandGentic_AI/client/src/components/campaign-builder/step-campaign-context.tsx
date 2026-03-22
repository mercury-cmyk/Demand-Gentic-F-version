/**
 * Step - Campaign Context
 *
 * Captures the core campaign context required for AI agent conversations:
 * - Organization association (Problem Intelligence Org)
 * - Campaign objective
 * - Talking points / key messages
 * - Product/service info, target audience, objections
 *
 * Supports AI-powered context generation from Organization Intelligence.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Target,
  Building,
  MessageSquare,
  Plus,
  X,
  Lightbulb,
  Sparkles,
  Wand2,
  CheckCircle2,
  Users,
  Package,
  ShieldAlert,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CampaignOrganization {
  id: string;
  name: string;
  industry?: string;
}

interface GeneratedContext {
  campaignObjective: string;
  talkingPoints: string[];
  successCriteria: string;
  productServiceInfo: string;
  targetAudienceDescription: string;
  campaignObjections: Array;
}

interface StepCampaignContextProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export function StepCampaignContext({ data, onNext, onBack }: StepCampaignContextProps) {
  const { toast } = useToast();

  // Organization selection
  const [selectedOrgId, setSelectedOrgId] = useState(data?.organizationId || "");

  // Core fields
  const [campaignObjective, setCampaignObjective] = useState(data?.campaignObjective || "");
  const [talkingPoints, setTalkingPoints] = useState(
    data?.talkingPoints?.length > 0 ? data.talkingPoints : [""]
  );
  const [successCriteria, setSuccessCriteria] = useState(data?.successCriteria || "");

  // Extended fields (populated by AI or manual)
  const [productServiceInfo, setProductServiceInfo] = useState(data?.productServiceInfo || "");
  const [targetAudienceDescription, setTargetAudienceDescription] = useState(data?.targetAudienceDescription || "");
  const [campaignObjections, setCampaignObjections] = useState>(
    data?.campaignObjections?.length > 0 ? data.campaignObjections : []
  );

  // AI generation state
  const [aiGenerated, setAiGenerated] = useState(false);

  // Fetch available organizations
  const { data: organizations = [], isLoading: orgsLoading } = useQuery({
    queryKey: ["campaign-organizations"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/campaign-organizations");
        if (!res.ok) return [];
        const result = await res.json();
        return result.organizations || result || [];
      } catch {
        return [];
      }
    },
  });

  // AI context generation mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/campaign-manager/generate-context", {
        organizationId: selectedOrgId,
        campaignType: data?.type || "call",
        campaignName: data?.name,
        existingObjective: campaignObjective.trim() || undefined,
        existingTalkingPoints: talkingPoints.filter(tp => tp.trim().length > 0),
      }, { timeout: 45000 });
      return res.json();
    },
    onSuccess: (result: { success: boolean; generated: GeneratedContext; organizationName: string }) => {
      if (!result.success || !result.generated) {
        toast({ title: "Generation failed", description: "AI returned an unexpected response.", variant: "destructive" });
        return;
      }

      const g = result.generated;

      // Apply generated fields
      if (g.campaignObjective) setCampaignObjective(g.campaignObjective);
      if (g.talkingPoints?.length > 0) setTalkingPoints(g.talkingPoints);
      if (g.successCriteria) setSuccessCriteria(g.successCriteria);
      if (g.productServiceInfo) setProductServiceInfo(g.productServiceInfo);
      if (g.targetAudienceDescription) setTargetAudienceDescription(g.targetAudienceDescription);
      if (g.campaignObjections?.length > 0) setCampaignObjections(g.campaignObjections);

      setAiGenerated(true);
      toast({
        title: "Context Generated",
        description: `AI generated campaign context from ${result.organizationName}'s intelligence. Review and edit as needed.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Could not generate campaign context. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Objective templates based on campaign type
  const getObjectiveTemplates = () => {
    const type = data?.type || "call";
    const templates: Record = {
      appointment_generation: [
        "Book qualified meetings with decision makers at target accounts",
        "Schedule product demonstrations with IT leadership",
        "Secure discovery calls with procurement teams",
      ],
      high_quality_leads: [
        "Qualify inbound leads and determine sales-readiness",
        "Identify decision-making authority and budget timeline",
        "Capture buying signals and project requirements",
      ],
      live_webinar: [
        "Register qualified prospects for the upcoming webinar",
        "Confirm attendance and capture relevant attendee details",
        "Generate interest in the webinar topic and speakers",
      ],
      content_syndication: [
        "Follow up on content downloads and qualify interest level",
        "Understand how the content relates to their current challenges",
        "Advance engaged leads to next stage in funnel",
      ],
      executive_dinner: [
        "Secure RSVP for exclusive executive networking event",
        "Confirm attendance and capture dietary preferences",
        "Build anticipation for the event experience",
      ],
      call: [
        "Engage prospects and advance to next stage",
        "Qualify interest and capture contact preferences",
        "Identify pain points and potential solutions",
      ],
    };
    return templates[type] || templates.call;
  };

  // Talking point helpers
  const addTalkingPoint = () => setTalkingPoints([...talkingPoints, ""]);
  const removeTalkingPoint = (index: number) => {
    if (talkingPoints.length > 1) setTalkingPoints(talkingPoints.filter((_, i) => i !== index));
  };
  const updateTalkingPoint = (index: number, value: string) => {
    const updated = [...talkingPoints];
    updated[index] = value;
    setTalkingPoints(updated);
  };

  // Objection helpers
  const addObjection = () => setCampaignObjections([...campaignObjections, { objection: "", response: "" }]);
  const removeObjection = (index: number) => setCampaignObjections(campaignObjections.filter((_, i) => i !== index));
  const updateObjection = (index: number, field: "objection" | "response", value: string) => {
    const updated = [...campaignObjections];
    updated[index] = { ...updated[index], [field]: value };
    setCampaignObjections(updated);
  };

  // Validation
  const isValid = campaignObjective.trim().length > 0;

  const handleNext = () => {
    const validTalkingPoints = talkingPoints.filter((tp) => typeof tp === "string" && tp.trim().length > 0);
    const validObjections = campaignObjections.filter((o) => o.objection.trim().length > 0);

    onNext({
      organizationId: selectedOrgId || null,
      campaignObjective: campaignObjective.trim(),
      talkingPoints: validTalkingPoints.length > 0 ? validTalkingPoints : null,
      successCriteria: successCriteria.trim() || null,
      productServiceInfo: productServiceInfo.trim() || null,
      targetAudienceDescription: targetAudienceDescription.trim() || null,
      campaignObjections: validObjections.length > 0 ? validObjections : null,
    });
  };

  const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

  return (
    
      {/* Header */}
      
        
          
          Content & Context
        
        
          Define your campaign objective and provide context for AI-powered conversations.
        
      

      {/* Organization Selection */}
      
        
          
            
              
                
                Campaign Organization
                Recommended
              
              
                Select the organization this campaign is for. This provides context-aware intelligence during calls.
              
            
          
        
        
          {orgsLoading ? (
            
              
              Loading organizations...
            
          ) : organizations.length === 0 ? (
            
              No organizations available. You can proceed without one.
            
          ) : (
            
              
                
              
              
                None - Generic Context
                {organizations.map((org) => (
                  
                    {org.name}
                    {org.industry && ` (${org.industry})`}
                  
                ))}
              
            
          )}

          {/* AI Generate Button — visible when org is selected */}
          {selectedOrgId && (
            
              
                
                
                  
                    AI Context Generation
                  
                  
                    Auto-generate campaign objective, talking points, target audience, product info, and objection handling — all grounded in{" "}
                    {selectedOrg?.name || "the organization"}'s intelligence data.
                  
                
                 generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  className="shrink-0 bg-blue-600 hover:bg-blue-700"
                >
                  {generateMutation.isPending ? (
                    <>
                      
                      Generating...
                    
                  ) : (
                    <>
                      
                      Generate with AI
                    
                  )}
                
              
              {aiGenerated && (
                
                  
                  Context generated from organization intelligence. All fields below have been populated — review and edit as needed.
                
              )}
            
          )}
        
      

      {/* Campaign Objective */}
      
        
          
            
            Campaign Objective
            Required
          
          
            What is the primary goal of this campaign? This guides the AI agent&apos;s conversation strategy.
          
        
        
           setCampaignObjective(e.target.value)}
            className="min-h-[100px]"
          />

          {/* Quick templates */}
          
            
              
              Quick Templates
            
            
              {getObjectiveTemplates().map((template, i) => (
                 setCampaignObjective(template)}
                >
                  {template.substring(0, 50)}...
                
              ))}
            
          
        
      

      {/* Product / Service Info */}
      
        
          
            
            Product / Service Info
            Optional
          
          
            Describe the product or service being promoted. The AI agent uses this during conversations.
          
        
        
           setProductServiceInfo(e.target.value)}
            className="min-h-[80px]"
          />
        
      

      {/* Target Audience */}
      
        
          
            
            Target Audience
            Optional
          
          
            Who is the ideal prospect for this campaign? Include titles, industries, and company size.
          
        
        
           setTargetAudienceDescription(e.target.value)}
            className="min-h-[80px]"
          />
        
      

      {/* Talking Points */}
      
        
          
            
            Key Talking Points
            Optional
          
          
            What are the key messages or value propositions the AI should convey?
          
        
        
          {talkingPoints.map((point, index) => (
            
              {index + 1}.
               updateTalkingPoint(index, e.target.value)}
                className="flex-1"
              />
              {talkingPoints.length > 1 && (
                 removeTalkingPoint(index)}
                >
                  
                
              )}
            
          ))}

          
            
            Add Talking Point
          
        
      

      {/* Success Criteria */}
      
        
          
            
            Success Criteria
            Optional
          
          
            How do you define a successful call outcome?
          
        
        
           setSuccessCriteria(e.target.value)}
          />
          
            {[
              "Meeting booked with decision maker",
              "Demo scheduled",
              "Lead qualified for sales",
              "Contact information captured",
              "Interest confirmed for follow-up",
            ].map((criteria, i) => (
               setSuccessCriteria(criteria)}
              >
                {criteria}
              
            ))}
          
        
      

      {/* Objection Handling */}
      {campaignObjections.length > 0 && (
        
          
            
              
              Objection Handling
              AI Generated
            
            
              Common objections and recommended responses for the AI agent.
            
          
          
            {campaignObjections.map((obj, index) => (
              
                
                  {index + 1}.
                  
                    
                      Objection
                       updateObjection(index, "objection", e.target.value)}
                        placeholder="e.g., We already have a solution for this"
                      />
                    
                    
                      Recommended Response
                       updateObjection(index, "response", e.target.value)}
                        placeholder="e.g., I understand — many of our clients felt the same way initially..."
                        className="min-h-[60px]"
                      />
                    
                  
                   removeObjection(index)}
                  >
                    
                  
                
              
            ))}

            
              
              Add Objection
            
          
        
      )}

      {/* Add objection button when no objections exist yet */}
      {campaignObjections.length === 0 && (
        
          
          Add Objection Handling (Optional)
        
      )}

      {/* Navigation */}
      
        
          Back
        
        
          Continue
        
      
    
  );
}