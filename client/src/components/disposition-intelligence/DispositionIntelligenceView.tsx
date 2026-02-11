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
  const [filters, setFilters] = useState<DispositionIntelligenceFilters>(defaultDispositionFilters);

  const updateFilter = (key: keyof DispositionIntelligenceFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Global Filters */}
      <div className="flex items-center gap-4 px-4 py-3 border-b bg-background/50">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Campaign</Label>
          <Select value={filters.campaignId} onValueChange={(v) => updateFilter('campaignId', v)}>
            <SelectTrigger className="w-[200px] h-8 text-sm">
              <SelectValue placeholder="All Campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campaigns</SelectItem>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
          <Input
            type="date"
            className="w-[140px] h-8 text-sm"
            value={filters.startDate || ''}
            onChange={(e) => updateFilter('startDate', e.target.value || null)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
          <Input
            type="date"
            className="w-[140px] h-8 text-sm"
            value={filters.endDate || ''}
            onChange={(e) => updateFilter('endDate', e.target.value || null)}
          />
        </div>
      </div>

      {/* Sub-tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-3">
          <TabsList className="grid w-full max-w-3xl grid-cols-5 bg-muted/40 p-1 rounded-lg">
            <TabsTrigger value="overview" className="gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="deep-dive" className="gap-1.5 text-xs">
              <Search className="h-3.5 w-3.5" />
              Deep Dive
            </TabsTrigger>
            <TabsTrigger value="agent-performance" className="gap-1.5 text-xs">
              <TrendingUp className="h-3.5 w-3.5" />
              Agent Performance
            </TabsTrigger>
            <TabsTrigger value="campaign" className="gap-1.5 text-xs">
              <Target className="h-3.5 w-3.5" />
              Campaign Intel
            </TabsTrigger>
            <TabsTrigger value="coaching" className="gap-1.5 text-xs">
              <GraduationCap className="h-3.5 w-3.5" />
              Coaching
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto">
          <TabsContent value="overview" className="mt-0 p-4">
            <OverviewDashboard filters={filters} />
          </TabsContent>

          <TabsContent value="deep-dive" className="mt-0 p-4">
            <DispositionDeepDive filters={filters} />
          </TabsContent>

          <TabsContent value="agent-performance" className="mt-0 p-4">
            <AgentPerformancePipeline filters={filters} />
          </TabsContent>

          <TabsContent value="campaign" className="mt-0 p-4">
            <CampaignIntelligence filters={filters} campaigns={campaigns} />
          </TabsContent>

          <TabsContent value="coaching" className="mt-0 p-4">
            <CoachingRecommendations filters={filters} campaigns={campaigns} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
