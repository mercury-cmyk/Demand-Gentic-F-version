/**
 * Disposition Intelligence View
 *
 * Main container with 5 sub-tabs for disposition analysis:
 * Overview, Deep Dive, Agent Performance, Campaign Intel, Coaching
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart3, Search, Target, GraduationCap, TrendingUp } from 'lucide-react';
import { type DispositionIntelligenceFilters, defaultDispositionFilters } from './types';
import { OverviewDashboard } from './OverviewDashboard';
import { DispositionDeepDive } from './DispositionDeepDive';
import { AgentPerformancePipeline } from './AgentPerformancePipeline';
import { CampaignIntelligence } from './CampaignIntelligence';
import { CoachingRecommendations } from './CoachingRecommendations';

interface Campaign {
  id: string;
  name: string;
}

interface DispositionIntelligenceViewProps {
  campaigns: Campaign[];
}

export function DispositionIntelligenceView({ campaigns }: DispositionIntelligenceViewProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [filters, setFilters] = useState(defaultDispositionFilters);

  const updateFilter = (key: keyof DispositionIntelligenceFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  return (
    
      {/* Global Filters */}
      
        
          Campaign
           updateFilter('campaignId', v)}>
            
              
            
            
              All Campaigns
              {campaigns.map(c => (
                {c.name}
              ))}
            
          
        

        
          From
           updateFilter('startDate', e.target.value || null)}
          />
        

        
          To
           updateFilter('endDate', e.target.value || null)}
          />
        
      

      {/* Sub-tabs */}
      
        
          
            
              
              Overview
            
            
              
              Deep Dive
            
            
              
              Agent Performance
            
            
              
              Campaign Intel
            
            
              
              Coaching
            
          
        

        
          
            
          

          
            
          

          
            
          

          
            
          

          
            
          
        
      
    
  );
}