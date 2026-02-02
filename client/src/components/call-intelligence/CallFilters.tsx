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

  const updateFilter = <K extends keyof CallIntelligenceFilters>(
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
    <div className={cn('space-y-4', className)}>
      {/* Primary Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts, companies, transcripts..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Campaign Filter */}
        <Select
          value={filters.campaignId}
          onValueChange={(value) => updateFilter('campaignId', value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Campaigns" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            {campaigns.map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Agent Type */}
        <Select
          value={filters.agentType}
          onValueChange={(value) => updateFilter('agentType', value as any)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Agent Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            <SelectItem value="ai">
              <span className="flex items-center gap-2">
                <Bot className="h-4 w-4" />
                AI Agent
              </span>
            </SelectItem>
            <SelectItem value="human">
              <span className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Human
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Date Range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[200px] justify-start">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {filters.dateRange.start ? (
                filters.dateRange.end ? (
                  <>
                    {format(filters.dateRange.start, 'MMM d')} -{' '}
                    {format(filters.dateRange.end, 'MMM d')}
                  </>
                ) : (
                  format(filters.dateRange.start, 'MMM d, yyyy')
                )
              ) : (
                'Date Range'
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex">
              <div className="border-r p-2 space-y-1">
                {DATE_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      const end = endOfDay(new Date());
                      const start = startOfDay(subDays(new Date(), preset.days));
                      updateFilter('dateRange', { start, end });
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => updateFilter('dateRange', { start: null, end: null })}
                >
                  Clear
                </Button>
              </div>
              <Calendar
                mode="range"
                selected={{
                  from: filters.dateRange.start || undefined,
                  to: filters.dateRange.end || undefined,
                }}
                onSelect={(range) => {
                  updateFilter('dateRange', {
                    start: range?.from || null,
                    end: range?.to || null,
                  });
                }}
                numberOfMonths={2}
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* Advanced Filters Toggle */}
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              {showAdvanced ? 'Hide' : 'More'} Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFilterCount}
                </Badge>
              )}
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', showAdvanced && 'rotate-180')}
              />
            </Button>
          </CollapsibleTrigger>
        </Collapsible>

        {/* Clear All */}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-4 w-4" />
            Clear All
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
            {/* Phone Number */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs">
                <Phone className="h-3 w-3" />
                Phone Number
              </Label>
              <Input
                placeholder="Filter by phone..."
                value={filters.phoneNumber}
                onChange={(e) => updateFilter('phoneNumber', e.target.value)}
              />
            </div>

            {/* Disposition */}
            <div className="space-y-2">
              <Label className="text-xs">Disposition</Label>
              <Select
                value={filters.disposition}
                onValueChange={(value) => updateFilter('disposition', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Dispositions" />
                </SelectTrigger>
                <SelectContent>
                  {DISPOSITIONS.map((disp) => (
                    <SelectItem key={disp.value} value={disp.value}>
                      {disp.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Duration Range */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs">
                <Clock className="h-3 w-3" />
                Duration (seconds)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={filters.durationRange.min ?? ''}
                  onChange={(e) =>
                    updateFilter('durationRange', {
                      ...filters.durationRange,
                      min: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className="w-20"
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  type="number"
                  placeholder="Max"
                  value={filters.durationRange.max ?? ''}
                  onChange={(e) =>
                    updateFilter('durationRange', {
                      ...filters.durationRange,
                      max: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className="w-20"
                />
              </div>
            </div>

            {/* Quality Score Range */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs">
                <BarChart3 className="h-3 w-3" />
                Quality Score (0-100)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  min={0}
                  max={100}
                  value={filters.qualityScoreRange.min ?? ''}
                  onChange={(e) =>
                    updateFilter('qualityScoreRange', {
                      ...filters.qualityScoreRange,
                      min: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className="w-20"
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  type="number"
                  placeholder="Max"
                  min={0}
                  max={100}
                  value={filters.qualityScoreRange.max ?? ''}
                  onChange={(e) =>
                    updateFilter('qualityScoreRange', {
                      ...filters.qualityScoreRange,
                      max: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className="w-20"
                />
              </div>
            </div>

            {/* Sentiment */}
            <div className="space-y-2">
              <Label className="text-xs">Sentiment</Label>
              <Select
                value={filters.sentiment}
                onValueChange={(value) => updateFilter('sentiment', value as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Sentiments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sentiments</SelectItem>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Content Filters */}
            <div className="space-y-3 col-span-1 md:col-span-2 lg:col-span-3">
              <Label className="text-xs">Content Availability</Label>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hasRecording"
                    checked={filters.hasRecording === true}
                    onCheckedChange={(checked) =>
                      updateFilter('hasRecording', checked === 'indeterminate' ? null : checked ? true : null)
                    }
                  />
                  <label htmlFor="hasRecording" className="text-sm flex items-center gap-1">
                    <Mic className="h-3 w-3" />
                    Has Recording
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hasTranscript"
                    checked={filters.hasTranscript === true}
                    onCheckedChange={(checked) =>
                      updateFilter('hasTranscript', checked === 'indeterminate' ? null : checked ? true : null)
                    }
                  />
                  <label htmlFor="hasTranscript" className="text-sm flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Has Transcript
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hasAnalysis"
                    checked={filters.hasAnalysis === true}
                    onCheckedChange={(checked) =>
                      updateFilter('hasAnalysis', checked === 'indeterminate' ? null : checked ? true : null)
                    }
                  />
                  <label htmlFor="hasAnalysis" className="text-sm flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Has Quality Analysis
                  </label>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Active Filter Tags */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.search && (
            <FilterTag
              label={`Search: "${filters.search}"`}
              onRemove={() => updateFilter('search', '')}
            />
          )}
          {filters.campaignId !== 'all' && (
            <FilterTag
              label={`Campaign: ${campaigns.find((c) => c.id === filters.campaignId)?.name || filters.campaignId}`}
              onRemove={() => updateFilter('campaignId', 'all')}
            />
          )}
          {filters.agentType !== 'all' && (
            <FilterTag
              label={`Agent: ${filters.agentType === 'ai' ? 'AI' : 'Human'}`}
              onRemove={() => updateFilter('agentType', 'all')}
            />
          )}
          {(filters.dateRange.start || filters.dateRange.end) && (
            <FilterTag
              label={`Date: ${filters.dateRange.start ? format(filters.dateRange.start, 'MMM d') : 'Any'} - ${filters.dateRange.end ? format(filters.dateRange.end, 'MMM d') : 'Any'}`}
              onRemove={() => updateFilter('dateRange', { start: null, end: null })}
            />
          )}
          {filters.disposition !== 'all' && (
            <FilterTag
              label={`Disposition: ${filters.disposition}`}
              onRemove={() => updateFilter('disposition', 'all')}
            />
          )}
          {filters.sentiment !== 'all' && (
            <FilterTag
              label={`Sentiment: ${filters.sentiment}`}
              onRemove={() => updateFilter('sentiment', 'all')}
            />
          )}
          {filters.hasRecording === true && (
            <FilterTag
              label="Has Recording"
              onRemove={() => updateFilter('hasRecording', null)}
            />
          )}
          {filters.hasTranscript === true && (
            <FilterTag
              label="Has Transcript"
              onRemove={() => updateFilter('hasTranscript', null)}
            />
          )}
          {filters.hasAnalysis === true && (
            <FilterTag
              label="Has Analysis"
              onRemove={() => updateFilter('hasAnalysis', null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {label}
      <button
        onClick={onRemove}
        className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

export default CallFilters;
