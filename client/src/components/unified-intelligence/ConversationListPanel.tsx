/**
 * Conversation List Panel Component
 *
 * Left panel for displaying filtered list of conversations
 * with search, filters, and counters.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare,
  Phone,
  Mail,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  FileText,
  Building,
  Mic,
  BarChart3,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type {
  UnifiedConversationListItem,
  UnifiedIntelligenceFilters,
} from './types';

interface ConversationListPanelProps {
  conversations: UnifiedConversationListItem[];
  filters: UnifiedIntelligenceFilters;
  onFiltersChange: (filters: UnifiedIntelligenceFilters) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  campaigns: Array<{ id: string; name: string }>;
  stats: {
    total: number;
    calls: number;
    emails: number;
    testCalls: number;
    withTranscripts: number;
    analyzedWithScores?: number;
    avgQualityScore?: number;
  };
}

export function ConversationListPanel({
  conversations,
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
  isLoading,
  campaigns,
  stats,
}: ConversationListPanelProps) {
  const updateFilter = <K extends keyof UnifiedIntelligenceFilters>(
    key: K,
    value: UnifiedIntelligenceFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatCard icon={<MessageSquare className="h-4 w-4" />} value={stats.total} label="Total" />
        <StatCard icon={<Phone className="h-4 w-4 text-purple-500" />} value={stats.calls} label="Calls" />
        <StatCard icon={<BarChart3 className="h-4 w-4 text-blue-500" />} value={stats.analyzedWithScores ?? 0} label="Analyzed" />
        <StatCard icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />} value={stats.testCalls} label="Test Calls" />
        <StatCard icon={<FileText className="h-4 w-4 text-green-500" />} value={stats.avgQualityScore !== undefined ? `${stats.avgQualityScore}/100` : '--'} label="Avg Score" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium">Filters</p>
              <p className="text-[11px] text-muted-foreground">Refine conversations quickly</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="flex-1 min-w-[180px]">
              <Label htmlFor="search" className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Name, company..."
                  value={filters.search}
                  onChange={(e) => updateFilter('search', e.target.value)}
                  className="pl-7 h-8 text-sm"
                />
              </div>
            </div>

            {/* Campaign */}
            <div className="w-[140px]">
              <Label className="text-xs">Campaign</Label>
              <Select value={filters.campaignId} onValueChange={(v) => updateFilter('campaignId', v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type */}
            <div className="w-[100px]">
              <Label className="text-xs">Type</Label>
              <Select value={filters.type} onValueChange={(v) => updateFilter('type', v as any)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="test">Test</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Source */}
            <div className="w-[120px]">
              <Label className="text-xs">Source</Label>
              <Select value={filters.source} onValueChange={(v) => updateFilter('source', v as any)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="call_session">Calls</SelectItem>
                  <SelectItem value="test_call">Test Calls</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Disposition */}
            <div className="w-[130px]">
              <Label className="text-xs">Disposition</Label>
              <Select value={filters.disposition} onValueChange={(v) => updateFilter('disposition', v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                  <SelectItem value="callback">Callback</SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                  <SelectItem value="no_answer">No Answer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Transcripts Toggle */}
            <div className="flex items-center space-x-2 pb-1">
              <Checkbox
                id="hasTranscripts"
                checked={filters.hasTranscript === true}
                onCheckedChange={(checked) => updateFilter('hasTranscript', checked ? true : null)}
              />
              <Label htmlFor="hasTranscripts" className="text-xs cursor-pointer whitespace-nowrap">
                With transcripts
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conversation List */}
      <Card className="h-[520px] flex flex-col">
        <CardHeader className="pb-2 px-4 pt-3 border-b bg-muted/30">
          <CardTitle className="text-sm">Conversations</CardTitle>
          <CardDescription className="text-xs">
            {conversations.length} result{conversations.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">No conversations found</p>
              <p className="text-xs">Try adjusting filters</p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="p-2 space-y-2">
                {conversations.map((conv) => (
                  <ConversationCard
                    key={conv.id}
                    conversation={conv}
                    isSelected={selectedId === conv.id}
                    onClick={() => onSelect(conv.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
}) {
  return (
    <Card className="p-2 border-muted/60 bg-background/80 shadow-sm">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <p className="text-lg font-semibold leading-none">{value}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function ConversationCard({
  conversation,
  isSelected,
  onClick,
}: {
  conversation: UnifiedConversationListItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isTest = conversation.type === 'test';

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md p-3 border-muted/60 bg-background/80 hover:bg-muted/20',
        isSelected && 'ring-2 ring-primary/60 bg-primary/5',
        isTest && 'border-yellow-200 bg-yellow-50/40'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Contact & Agent Type */}
          <div className="flex items-center gap-2 mb-1">
            {conversation.interactionType === 'call' ? (
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="font-medium text-sm truncate">{conversation.contactName || 'Unknown'}</span>
            {conversation.agentType === 'ai' && (
              <Badge variant="secondary" className="text-[10px] px-1">AI</Badge>
            )}
            {conversation.callCount && conversation.callCount > 1 && (
              <Badge variant="outline" className="text-[10px] px-1 bg-blue-50 text-blue-700 border-blue-300">
                {conversation.callCount} calls
              </Badge>
            )}
          </div>
          {/* Company */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building className="h-3 w-3" />
            <span className="truncate">{conversation.companyName || 'Unknown'}</span>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-col items-end gap-1">
          <SourceBadge isTest={isTest} />
          {conversation.disposition && (
            <DispositionBadge disposition={conversation.disposition} />
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="truncate max-w-[120px]">{conversation.campaignName}</span>
        <div className="flex items-center gap-2">
          {conversation.durationSec !== undefined && conversation.durationSec > 0 && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {Math.floor(conversation.durationSec / 60)}:{String(conversation.durationSec % 60).padStart(2, '0')}
            </span>
          )}
          <span>
            {format(new Date(conversation.createdAt), 'MMM d, HH:mm')}
          </span>
        </div>
      </div>

      {/* Indicators */}
      <div className="mt-1.5 flex items-center gap-2">
        {conversation.hasTranscript && (
          <span className="flex items-center gap-0.5 text-[10px] text-green-600">
            <FileText className="h-2.5 w-2.5" />
            Transcript
          </span>
        )}
        {conversation.hasRecording && (
          <span className="flex items-center gap-0.5 text-[10px] text-blue-600">
            <Mic className="h-2.5 w-2.5" />
            Recording
          </span>
        )}
        {conversation.qualityScore !== undefined && (
          <span className="flex items-center gap-0.5 text-[10px]">
            <BarChart3 className="h-2.5 w-2.5" />
            {conversation.qualityScore}
          </span>
        )}
        {conversation.issueCount !== undefined && conversation.issueCount > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-yellow-600">
            <AlertTriangle className="h-2.5 w-2.5" />
            {conversation.issueCount} issues
          </span>
        )}
        {conversation.testResult && (
          <TestResultBadge result={conversation.testResult} />
        )}
      </div>
    </Card>
  );
}

function SourceBadge({ isTest }: { isTest: boolean }) {
  if (isTest) {
    return (
      <Badge variant="outline" className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-300 px-1">
        Test
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] px-1">
      Production
    </Badge>
  );
}

function DispositionBadge({ disposition }: { disposition: string }) {
  const config: Record<string, { className: string }> = {
    qualified: { className: 'bg-green-600 text-white' },
    not_interested: { className: '' },
    voicemail: { className: '' },
    no_answer: { className: '' },
    callback_requested: { className: 'bg-blue-600 text-white' },
    callback: { className: 'bg-blue-600 text-white' },
    dnc_request: { className: 'bg-red-600 text-white' },
  };

  const { className } = config[disposition] || {};

  return (
    <Badge variant={className ? 'default' : 'outline'} className={cn('text-[10px] px-1', className)}>
      {disposition.replace(/_/g, ' ')}
    </Badge>
  );
}

function TestResultBadge({ result }: { result: string }) {
  if (result === 'success') {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-green-600">
        <CheckCircle className="h-2.5 w-2.5" />
        Success
      </span>
    );
  }
  if (result === 'failed') {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-red-600">
        <XCircle className="h-2.5 w-2.5" />
        Failed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-yellow-600">
      <AlertTriangle className="h-2.5 w-2.5" />
      {result.replace(/_/g, ' ')}
    </span>
  );
}
