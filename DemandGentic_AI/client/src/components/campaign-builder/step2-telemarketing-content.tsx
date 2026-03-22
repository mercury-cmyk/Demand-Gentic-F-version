import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronRight,
  Plus,
  ClipboardList,
  Sparkles,
  PenLine
} from "lucide-react";
import { CampaignAutoGenerate } from "./campaign-auto-generate";
import { CampaignContextEditor } from "@/components/campaigns/CampaignContextEditor";

interface Step2TelemarketingProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export function Step2TelemarketingContent({ data, onNext }: Step2TelemarketingProps) {
  const [qualificationFields, setQualificationFields] = useState(data.content?.qualificationFields || []);
  const [inputMode, setInputMode] = useState("auto");

  // Campaign Context fields (shared between AI and Human agents)
  const [campaignType, setCampaignType] = useState(data.type || '');
  const [campaignContextBrief, setCampaignContextBrief] = useState(data.campaignContextBrief || '');
  const [campaignObjective, setCampaignObjective] = useState(data.campaignObjective || '');
  const [productServiceInfo, setProductServiceInfo] = useState(data.productServiceInfo || '');
  const [talkingPoints, setTalkingPoints] = useState(data.talkingPoints || []);
  const [targetAudienceDescription, setTargetAudienceDescription] = useState(data.targetAudienceDescription || '');
  const [successCriteria, setSuccessCriteria] = useState(data.successCriteria || '');
  const [campaignObjections, setCampaignObjections] = useState(data.campaignObjections || []);

  // Handle AI-generated campaign application
  const handleAutoGenerateApply = (generated: {
    campaignType: string;
    campaignObjective: string;
    campaignContextBrief: string;
    productServiceInfo: string;
    talkingPoints: string[];
    targetAudienceDescription: string;
    successCriteria: string;
    campaignObjections: any[];
    qualificationQuestions: any[];
  }) => {
    // IMPORTANT: Do NOT override campaign type - it was already selected in Step 0
    // The AI-inferred type is ignored to prevent duplication
    // If no type was set in Step 0, then use the AI-generated type as fallback
    if (!data.type && generated.campaignType) {
      setCampaignType(generated.campaignType);
    }
    setCampaignContextBrief(generated.campaignContextBrief || '');
    setCampaignObjective(generated.campaignObjective);
    setProductServiceInfo(generated.productServiceInfo);
    setTalkingPoints(generated.talkingPoints);
    setTargetAudienceDescription(generated.targetAudienceDescription);
    setSuccessCriteria(generated.successCriteria);
    setCampaignObjections(generated.campaignObjections);

    // Convert qualification questions to the existing format
    if (generated.qualificationQuestions?.length > 0) {
      const converted = generated.qualificationQuestions.map((q, idx) => ({
        id: Date.now() + idx,
        label: q.question,
        type: q.type === 'boolean' ? 'radio' : q.type,
        required: q.required,
        options: q.options
      }));
      setQualificationFields(converted);
    }

    // Switch to manual mode to show filled fields
    setInputMode("manual");
  };

  const handleNext = () => {
    onNext({
      content: {
        qualificationFields,
      },
      // Campaign type (can be overridden by AI generation)
      type: campaignType || data.type,
      // Campaign Context fields
      campaignContextBrief: campaignContextBrief || undefined,
      campaignObjective,
      productServiceInfo,
      talkingPoints: talkingPoints.length > 0 ? talkingPoints : undefined,
      targetAudienceDescription,
      successCriteria,
      campaignObjections: campaignObjections.length > 0 ? campaignObjections : undefined,
    });
  };

  const handleAddQualificationField = () => {
    setQualificationFields([
      ...qualificationFields,
      { id: Date.now(), label: "", type: "text", required: false },
    ]);
  };

  return (
    
      {/* Mode Selection Tabs */}
       setInputMode(v as "auto" | "manual")}>
        
          
            
            AI Auto-Generate
          
          
            
            Manual Entry
          
        

        {/* AI Auto-Generate Tab */}
        
           {}}
            onApply={handleAutoGenerateApply}
            hideTypeFromPreview={!!data.type} // Hide type preview if already selected in Step 0
          />
        

        {/* Manual Entry Tab */}
        
          {/* Campaign Context Section */}
           {
              setCampaignObjective(newData.campaignObjective);
              setCampaignContextBrief(newData.campaignContextBrief || '');
              setProductServiceInfo(newData.productServiceInfo);
              setTalkingPoints(newData.talkingPoints);
              setTargetAudienceDescription(newData.targetAudienceDescription);
              setSuccessCriteria(newData.successCriteria);
              setCampaignObjections(newData.campaignObjections || []);
            }}
          />

          {/* Qualification Form Builder */}
          
            
              
                
                  Qualification Questions
                  Build the qualification form for lead capture
                
                
                  
                  Add Question
                
              
            
            
              {qualificationFields.length === 0 ? (
                
                  
                  
                    No qualification questions yet. Add questions to capture lead information during calls.
                  
                  
                    
                    Add First Question
                  
                
              ) : (
                
                  {qualificationFields.map((field: any, index: number) => (
                    
                      
                        
                          
                            Question Label
                            
                          
                          
                            Field Type
                            
                              
                                
                              
                              
                                Text
                                Number
                                Dropdown
                                Radio
                                Checkbox
                                Date
                              
                            
                          
                        
                        
                          
                            
                            Required field
                          
                          Question {index + 1}
                        
                      
                    
                  ))}
                
              )}

              
                
                  Form Integration
                  
                    Qualification responses are linked to QA portal and auto-populate lead records
                  
                
              
            
          
        
      

      {/* Next Button */}
      
        
          Continue to Scheduling
          
        
      
    
  );
}