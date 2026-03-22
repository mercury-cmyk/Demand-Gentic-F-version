import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAMPAIGN_TYPES, getCampaignTypesForChannel } from "@/lib/campaign-types";

interface Step0Props {
  data: any;
  onNext: (data: any) => void;
  /** Channel filter - only show types that support this channel */
  channel?: 'email' | 'voice';
}

// Re-export for backward compatibility
export { CAMPAIGN_TYPES } from "@/lib/campaign-types";

export function Step0CampaignType({ data, onNext, channel }: Step0Props) {
  const [selectedType, setSelectedType] = useState(data?.type || "");

  // Get campaign types filtered by channel if specified
  const availableTypes = channel
    ? getCampaignTypesForChannel(channel).map(({ value, label, description }) => ({ value, label, description }))
    : CAMPAIGN_TYPES;

  const handleNext = () => {
    onNext({ ...data, type: selectedType });
  };

  return (
    
      
        Select Campaign Type
        
          Choose the type of campaign to automatically configure {channel === 'voice' ? 'agent behavior' : 'email strategy'} and objectives.
          {channel && (
            
              Campaign types are standardized across email and voice channels for consistent strategy.
            
          )}
        
      

      
        
          Campaign Type
          
            This selection determines the {channel === 'voice' ? "AI agent's strategy, intelligence rules, and success criteria" : 'email tone, messaging approach, and call-to-action strategy'}.
            Both email and voice campaigns follow the same strategic intent.
          
        
        
          
            Type
            
              
                
              
              
                {availableTypes.map((type) => (
                  
                    {type.label}
                    - {type.description}
                  
                ))}
              
            
          
        
      

      
        
          Next Step
        
      
    
  );
}