import { Phone, Mail, MessageSquareText, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FunnelStage {
  stage: string;
  stageLabel: string;
  objective: string;
  primaryChannels: string[];
  secondaryChannels?: string[];
  estimatedConversionRate: string;
  estimatedVolumeAtStage: string;
  durationDays: number;
  tactics?: string[];
  messagingTheme?: string;
}

interface FunnelVisualizationProps {
  funnelStrategy: FunnelStage[];
  onStageClick?: (stage: string) => void;
  compact?: boolean;
}

const STAGE_COLORS: Record = {
  awareness: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', gradient: 'from-blue-500 to-blue-600' },
  engaged: { bg: 'bg-cyan-50', border: 'border-cyan-300', text: 'text-cyan-700', gradient: 'from-cyan-500 to-cyan-600' },
  qualifying: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', gradient: 'from-amber-500 to-amber-600' },
  qualified_sql: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', gradient: 'from-orange-500 to-orange-600' },
  appointment: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', gradient: 'from-purple-500 to-purple-600' },
  closed_won: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', gradient: 'from-green-500 to-green-600' },
};

const DEFAULT_COLORS = { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-700', gradient: 'from-gray-500 to-gray-600' };

function ChannelIcon({ channel, size = 14 }: { channel: string; size?: number }) {
  switch (channel) {
    case 'voice': return ;
    case 'email': return ;
    case 'messaging': return ;
    default: return null;
  }
}

export function FunnelVisualization({ funnelStrategy, onStageClick, compact = false }: FunnelVisualizationProps) {
  if (!funnelStrategy?.length) {
    return (
      
        No funnel strategy available
      
    );
  }

  return (
    
      
        {/* Desktop: Horizontal funnel */}
        
          {funnelStrategy.map((stage, idx) => {
            const colors = STAGE_COLORS[stage.stage] || DEFAULT_COLORS;
            const isLast = idx === funnelStrategy.length - 1;
            // Funnel narrows: width decreases from left to right
            const widthPercent = 100 / funnelStrategy.length;

            return (
              
                
                  
                     onStageClick?.(stage.stage)}
                      className={`flex-1 ${colors.bg} ${colors.border} border rounded-lg p-3 hover:shadow-md transition-all cursor-pointer group relative`}
                    >
                      {/* Stage header bar */}
                      

                      {/* Stage label */}
                      
                        {stage.stageLabel}
                      

                      {/* Volume */}
                      
                        {stage.estimatedVolumeAtStage}
                      

                      {/* Conversion rate */}
                      
                        {stage.estimatedConversionRate} conversion
                      

                      {/* Channel icons */}
                      
                        {stage.primaryChannels.map((ch) => (
                          
                            
                            {ch}
                          
                        ))}
                      

                      {/* Duration */}
                      {!compact && (
                        
                          ~{stage.durationDays} days
                        
                      )}
                    
                  
                  
                    {stage.stageLabel}
                    {stage.objective}
                    {stage.messagingTheme && (
                      Theme: {stage.messagingTheme}
                    )}
                  
                

                {/* Arrow connector */}
                {!isLast && (
                  
                )}
              
            );
          })}
        

        {/* Mobile: Vertical funnel */}
        
          {funnelStrategy.map((stage, idx) => {
            const colors = STAGE_COLORS[stage.stage] || DEFAULT_COLORS;
            const isLast = idx === funnelStrategy.length - 1;

            return (
              
                 onStageClick?.(stage.stage)}
                  className={`w-full ${colors.bg} ${colors.border} border rounded-lg p-3 text-left hover:shadow-md transition-all`}
                >
                  
                    
                      {stage.stageLabel}
                    
                    
                      {stage.estimatedConversionRate}
                    
                  
                  {stage.estimatedVolumeAtStage}
                  
                    {stage.primaryChannels.map((ch) => (
                      
                        
                        {ch}
                      
                    ))}
                  
                
                {!isLast && (
                  
                    
                  
                )}
              
            );
          })}
        
      
    
  );
}