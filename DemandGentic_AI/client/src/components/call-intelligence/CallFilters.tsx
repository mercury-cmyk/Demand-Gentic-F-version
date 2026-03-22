/**
 * Call Filters Component
 *
 * Comprehensive filtering controls for the call intelligence dashboard
 * including search, date range, duration, quality score, and more.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Search,
  Filter,
  X,
  ChevronDown,
  CalendarIcon,
  Phone,
  Clock,
  BarChart3,
  Bot,
  User,
  FileText,
  Mic,
  Sparkles,
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { type CallIntelligenceFilters, defaultFilters } from './types';

interface Campaign {
  id: string;
  name: string;
}

interface CallFiltersProps {
  filters: CallIntelligenceFilters;
  onFiltersChange: (filters: CallIntelligenceFilters) => void;
  campaigns?: Campaign[];
  className?: string;
}

const DATE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

const DISPOSITIONS = [
  { value: 'all', label: 'All Dispositions' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'callback_requested', label: 'Callback Requested' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'gatekeeper', label: 'Gatekeeper' },
  { value: 'dnc_request', label: 'DNC Request' },
];

export function CallFilters({
  filters,
  onFiltersChange,
  campaigns = [],
  className,
}: CallFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateFilter = (
    key: K,
    value: CallIntelligenceFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange(defaultFilters);
  };

  // Count active filters
  const activeFilterCount = [
    filters.search,
    filters.campaignId !== 'all',
    filters.agentType !== 'all',
    filters.dateRange.start || filters.dateRange.end,
    filters.durationRange.min !== null || filters.durationRange.max !== null,
    filters.phoneNumber,
    filters.qualityScoreRange.min !== null || filters.qualityScoreRange.max !== null,
    filters.sentiment !== 'all',
    filters.hasTranscript !== null,
    filters.hasRecording !== null,
    filters.hasAnalysis !== null,
    filters.disposition !== 'all',
  ].filter(Boolean).length;

  return (
    
      {/* Primary Filters Row */}
      
        {/* Search */}
        
          
           updateFilter('search', e.target.value)}
            className="pl-9"
          />
        

        {/* Campaign Filter */}
         updateFilter('campaignId', value)}
        >
          
            
          
          
            All Campaigns
            {campaigns.map((campaign) => (
              
                {campaign.name}
              
            ))}
          
        

        {/* Agent Type */}
         updateFilter('agentType', value as any)}
        >
          
            
          
          
            All Agents
            
              
                
                AI Agent
              
            
            
              
                
                Human
              
            
          
        

        {/* Date Range */}
        
          
            
              
              {filters.dateRange.start ? (
                filters.dateRange.end ? (
                  <>
                    {format(filters.dateRange.start, 'MMM d')} -{' '}
                    {format(filters.dateRange.end, 'MMM d')}
                  
                ) : (
                  format(filters.dateRange.start, 'MMM d, yyyy')
                )
              ) : (
                'Date Range'
              )}
            
          
          
            
              
                {DATE_PRESETS.map((preset) => (
                   {
                      const end = endOfDay(new Date());
                      const start = startOfDay(subDays(new Date(), preset.days));
                      updateFilter('dateRange', { start, end });
                    }}
                  >
                    {preset.label}
                  
                ))}
                 updateFilter('dateRange', { start: null, end: null })}
                >
                  Clear
                
              
               {
                  updateFilter('dateRange', {
                    start: range?.from || null,
                    end: range?.to || null,
                  });
                }}
                numberOfMonths={2}
              />
            
          
        

        {/* Advanced Filters Toggle */}
        
          
            
              
              {showAdvanced ? 'Hide' : 'More'} Filters
              {activeFilterCount > 0 && (
                
                  {activeFilterCount}
                
              )}
              
            
          
        

        {/* Clear All */}
        {activeFilterCount > 0 && (
          
            
            Clear All
          
        )}
      

      {/* Advanced Filters */}
      
        
          
            {/* Phone Number */}
            
              
                
                Phone Number
              
               updateFilter('phoneNumber', e.target.value)}
              />
            

            {/* Disposition */}
            
              Disposition
               updateFilter('disposition', value)}
              >
                
                  
                
                
                  {DISPOSITIONS.map((disp) => (
                    
                      {disp.label}
                    
                  ))}
                
              
            

            {/* Duration Range */}
            
              
                
                Duration (seconds)
              
              
                
                    updateFilter('durationRange', {
                      ...filters.durationRange,
                      min: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className="w-20"
                />
                -
                
                    updateFilter('durationRange', {
                      ...filters.durationRange,
                      max: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className="w-20"
                />
              
            

            {/* Quality Score Range */}
            
              
                
                Quality Score (0-100)
              
              
                
                    updateFilter('qualityScoreRange', {
                      ...filters.qualityScoreRange,
                      min: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className="w-20"
                />
                -
                
                    updateFilter('qualityScoreRange', {
                      ...filters.qualityScoreRange,
                      max: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className="w-20"
                />
              
            

            {/* Sentiment */}
            
              Sentiment
               updateFilter('sentiment', value as any)}
              >
                
                  
                
                
                  All Sentiments
                  Positive
                  Neutral
                  Negative
                
              
            

            {/* Content Filters */}
            
              Content Availability
              
                
                  
                      updateFilter('hasRecording', checked === 'indeterminate' ? null : checked ? true : null)
                    }
                  />
                  
                    
                    Has Recording
                  
                

                
                  
                      updateFilter('hasTranscript', checked === 'indeterminate' ? null : checked ? true : null)
                    }
                  />
                  
                    
                    Has Transcript
                  
                

                
                  
                      updateFilter('hasAnalysis', checked === 'indeterminate' ? null : checked ? true : null)
                    }
                  />
                  
                    
                    Has Quality Analysis
                  
                
              
            
          
        
      

      {/* Active Filter Tags */}
      {activeFilterCount > 0 && (
        
          {filters.search && (
             updateFilter('search', '')}
            />
          )}
          {filters.campaignId !== 'all' && (
             c.id === filters.campaignId)?.name || filters.campaignId}`}
              onRemove={() => updateFilter('campaignId', 'all')}
            />
          )}
          {filters.agentType !== 'all' && (
             updateFilter('agentType', 'all')}
            />
          )}
          {(filters.dateRange.start || filters.dateRange.end) && (
             updateFilter('dateRange', { start: null, end: null })}
            />
          )}
          {filters.disposition !== 'all' && (
             updateFilter('disposition', 'all')}
            />
          )}
          {filters.sentiment !== 'all' && (
             updateFilter('sentiment', 'all')}
            />
          )}
          {filters.hasRecording === true && (
             updateFilter('hasRecording', null)}
            />
          )}
          {filters.hasTranscript === true && (
             updateFilter('hasTranscript', null)}
            />
          )}
          {filters.hasAnalysis === true && (
             updateFilter('hasAnalysis', null)}
            />
          )}
        
      )}
    
  );
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    
      {label}
      
        
      
    
  );
}

export default CallFilters;