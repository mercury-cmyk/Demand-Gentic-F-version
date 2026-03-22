/**
 * OrderConfigurationCard
 * Displays and allows editing of order configuration within AgentX chat
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Target,
  Building2,
  Users,
  Globe,
  Calendar,
  Phone,
  Mail,
  Edit2,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  type OrderConfiguration,
  type OrderRecommendation,
  CAMPAIGN_TYPES,
  DELIVERY_TIMELINES,
} from './order-agent-types';

interface OrderConfigurationCardProps {
  recommendation: OrderRecommendation;
  configuration: OrderConfiguration;
  onConfigurationChange: (config: Partial) => void;
  onApprove: () => void;
  onCancel: () => void;
  isEditing?: boolean;
  rationale?: string;
}

export function OrderConfigurationCard({
  recommendation,
  configuration,
  onConfigurationChange,
  onApprove,
  onCancel,
  isEditing = false,
  rationale,
}: OrderConfigurationCardProps) {
  const [editing, setEditing] = useState(isEditing);

  const campaignTypeLabel = CAMPAIGN_TYPES.find(
    (t) => t.value === configuration.campaignType
  )?.label || configuration.campaignType;

  const timelineLabel = DELIVERY_TIMELINES.find(
    (t) => t.value === configuration.deliveryTimeline
  )?.label || configuration.deliveryTimeline;

  const toggleChannel = (channel: string) => {
    const currentChannels = configuration.channels || [];
    if (currentChannels.includes(channel)) {
      onConfigurationChange({
        channels: currentChannels.filter((c) => c !== channel),
      });
    } else {
      onConfigurationChange({
        channels: [...currentChannels, channel],
      });
    }
  };

  return (
    
      {/* Header */}
      
        
          
            
          
          AI Recommendation
        
         setEditing(!editing)}
        >
          {editing ? (
            <>
              
              Done Editing
            
          ) : (
            <>
              
              Edit
            
          )}
        
      

      {/* Rationale */}
      {rationale && (
        
          
            {rationale}
          
        
      )}

      {/* Configuration */}
      
        {editing ? (
          
        ) : (
          
        )}
      

      {/* Actions */}
      
        
          
          Cancel
        
        
          
          Proceed with Order
        
      
    
  );
}

function ViewMode({
  configuration,
  campaignTypeLabel,
  timelineLabel,
}: {
  configuration: OrderConfiguration;
  campaignTypeLabel: string;
  timelineLabel: string;
}) {
  return (
    
      {/* Campaign Type & Volume */}
      
        
          
          {campaignTypeLabel}
        
        
          {configuration.volume} leads
        
      

      {/* Industries */}
      {configuration.industries && (
        
          
          
            Industries
            {configuration.industries}
          
        
      )}

      {/* Job Titles */}
      {configuration.jobTitles && (
        
          
          
            Job Titles
            {configuration.jobTitles}
          
        
      )}

      {/* Company Size */}
      {(configuration.companySizeMin || configuration.companySizeMax) && (
        
          
          
            {configuration.companySizeMin || 1} - {configuration.companySizeMax || '10,000+'} employees
          
        
      )}

      {/* Geographies */}
      {configuration.geographies && (
        
          
          
            Geographies
            {configuration.geographies}
          
        
      )}

      {/* Timeline & Channels */}
      
        
          
          {timelineLabel}
        
        
          {configuration.channels?.includes('voice') && (
            
              
              Voice
            
          )}
          {configuration.channels?.includes('email') && (
            
              
              Email
            
          )}
        
      
    
  );
}

function EditMode({
  configuration,
  onConfigurationChange,
  toggleChannel,
}: {
  configuration: OrderConfiguration;
  onConfigurationChange: (config: Partial) => void;
  toggleChannel: (channel: string) => void;
}) {
  return (
    
      {/* Campaign Type */}
      
        Campaign Type
         onConfigurationChange({ campaignType: value })}
        >
          
            
          
          
            {CAMPAIGN_TYPES.map((type) => (
              
                {type.label}
              
            ))}
          
        
      

      {/* Volume */}
      
        
          Volume
          {configuration.volume} leads
        
         onConfigurationChange({ volume: value })}
          min={25}
          max={1000}
          step={25}
          className="py-2"
        />
      

      {/* Industries */}
      
        Target Industries
         onConfigurationChange({ industries: e.target.value })}
          placeholder="e.g., Healthcare, Financial Services, Technology"
          className="h-9 text-sm"
        />
      

      {/* Job Titles */}
      
        Job Titles
         onConfigurationChange({ jobTitles: e.target.value })}
          placeholder="e.g., CIO, CTO, VP IT, Director of Engineering"
          className="h-9 text-sm"
        />
      

      {/* Geographies */}
      
        Geographies
         onConfigurationChange({ geographies: e.target.value })}
          placeholder="e.g., United States, Canada, UK"
          className="h-9 text-sm"
        />
      

      {/* Timeline */}
      
        Delivery Timeline
         onConfigurationChange({ deliveryTimeline: value })}
        >
          
            
          
          
            {DELIVERY_TIMELINES.map((timeline) => (
              
                {timeline.label}
              
            ))}
          
        
      

      {/* Channels */}
      
        Channels
        
          
             toggleChannel('voice')}
            />
            
              
              Voice
            
          
          
             toggleChannel('email')}
            />
            
              
              Email
            
          
        
      
    
  );
}