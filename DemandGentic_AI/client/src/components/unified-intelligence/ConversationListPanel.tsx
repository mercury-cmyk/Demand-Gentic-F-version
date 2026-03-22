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
  campaigns: Array;
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
  const updateFilter = (
    key: K,
    value: UnifiedIntelligenceFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    
      {/* Stats Cards */}
      
        } value={stats.total} label="Total" />
        } value={stats.calls} label="Calls" />
        } value={stats.analyzedWithScores ?? 0} label="Analyzed" />
        } value={stats.testCalls} label="Test Calls" />
        } value={stats.avgQualityScore !== undefined ? `${stats.avgQualityScore}/100` : '--'} label="Avg Score" />
      

      {/* Filters */}
      
        
          
            
              Filters
              Refine conversations quickly
            
          
          
            {/* Search */}
            
              Search
              
                
                 updateFilter('search', e.target.value)}
                  className="pl-7 h-8 text-sm"
                />
              
            

            {/* Campaign */}
            
              Campaign
               updateFilter('campaignId', v)}>
                
                  
                
                
                  All Campaigns
                  {campaigns.map((c) => (
                    {c.name}
                  ))}
                
              
            

            {/* Type */}
            
              Type
               updateFilter('type', v as any)}>
                
                  
                
                
                  All
                  Production
                  Test
                
              
            

            {/* Source */}
            
              Source
               updateFilter('source', v as any)}>
                
                  
                
                
                  All
                  Calls
                  Test Calls
                
              
            

            {/* Disposition */}
            
              Disposition
               updateFilter('disposition', v)}>
                
                  
                
                
                  All
                  Qualified
                  Not Interested
                  Callback
                  Voicemail
                  No Answer
                
              
            

            {/* Transcripts Toggle */}
            
               updateFilter('hasTranscript', checked ? true : null)}
              />
              
                With transcripts
              
            
          
        
      

      {/* Conversation List */}
      
        
          Conversations
          
            {conversations.length} result{conversations.length !== 1 ? 's' : ''}
          
        
        
          {isLoading ? (
            
              {[1, 2, 3, 4].map((i) => (
                
              ))}
            
          ) : conversations.length === 0 ? (
            
              
              No conversations found
              Try adjusting filters
            
          ) : (
            
              
                {conversations.map((conv) => (
                   onSelect(conv.id)}
                  />
                ))}
              
            
          )}
        
      
    
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
    
      
        {icon}
        
          {value}
          {label}
        
      
    
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
    
      
        
          {/* Contact & Agent Type */}
          
            {conversation.interactionType === 'call' ? (
              
            ) : (
              
            )}
            {conversation.contactName || 'Unknown'}
            {conversation.agentType === 'ai' && (
              AI
            )}
            {conversation.callCount && conversation.callCount > 1 && (
              
                {conversation.callCount} calls
              
            )}
          
          {/* Company */}
          
            
            {conversation.companyName || 'Unknown'}
          
        

        {/* Badges */}
        
          
          {conversation.disposition && (
            
          )}
        
      

      {/* Bottom Row */}
      
        {conversation.campaignName}
        
          {conversation.durationSec !== undefined && conversation.durationSec > 0 && (
            
              
              {Math.floor(conversation.durationSec / 60)}:{String(conversation.durationSec % 60).padStart(2, '0')}
            
          )}
          
            {format(new Date(conversation.createdAt), 'MMM d, HH:mm')}
          
        
      

      {/* Indicators */}
      
        {conversation.hasTranscript && (
          
            
            Transcript
          
        )}
        {conversation.hasRecording && (
          
            
            Recording
          
        )}
        {conversation.qualityScore !== undefined && (
          
            
            {conversation.qualityScore}
          
        )}
        {conversation.issueCount !== undefined && conversation.issueCount > 0 && (
          
            
            {conversation.issueCount} issues
          
        )}
        {conversation.testResult && (
          
        )}
      
    
  );
}

function SourceBadge({ isTest }: { isTest: boolean }) {
  if (isTest) {
    return (
      
        Test
      
    );
  }
  return (
    
      Production
    
  );
}

function DispositionBadge({ disposition }: { disposition: string }) {
  const config: Record = {
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
    
      {disposition.replace(/_/g, ' ')}
    
  );
}

function TestResultBadge({ result }: { result: string }) {
  if (result === 'success') {
    return (
      
        
        Success
      
    );
  }
  if (result === 'failed') {
    return (
      
        
        Failed
      
    );
  }
  return (
    
      
      {result.replace(/_/g, ' ')}
    
  );
}