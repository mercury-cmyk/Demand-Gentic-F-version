import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  ChevronLeft, ChevronRight, Search, Filter, Download, Eye, Headphones,
  FileText, Loader2, UserCheck, ArrowUpDown, RefreshCw, MessageSquare, Sparkles,
  TrendingUp, Building2, LayoutList,
} from 'lucide-react';
import { PushToShowcaseButton } from '@/components/showcase-calls/push-to-showcase-button';

interface QualifiedLead {
  id: string;
  callSessionId?: string | null;
  contactName: string | null;
  contactEmail: string | null;
  accountName: string | null;
  companyName?: string | null;
  accountIndustry: string | null;
  campaignId: string | null;
  campaignName: string | null;
  aiScore: string | null;
  callDuration: number | null;
  hasRecording: boolean;
  hasTranscript: boolean;
  qaStatus: string | null;
  createdAt: string | null;
  approvedAt: string | null;
  commentCount?: number;
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  approvedLeadsCount: number;
}

interface QualifiedLeadsDebugData {
  [key: string]: unknown;
}

interface QualifiedLeadsTableProps {
  onViewDetails: (leadId: string) => void;
  onExport: () => void;
}

export function QualifiedLeadsTable({ onViewDetails, onExport }: QualifiedLeadsTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('asc');

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch campaigns for filter dropdown
  const { data: campaigns = [] } = useQuery({
    queryKey: ['client-portal-lead-campaigns'],
    queryFn: async () => {
      const token = getToken();
      console.log('[QualifiedLeads] Fetching campaigns, token present:', !!token);
      const res = await fetch('/api/client-portal/qualified-leads/campaigns', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[QualifiedLeads] campaigns fetch failed:', res.status, errorText);
        return [];
      }
      return res.json();
    },
  });

  // Fetch leads with pagination and filters
  const { data: leadsResponse, isLoading, refetch } = useQuery({
    queryKey: ['client-portal-qualified-leads', page, pageSize, search, campaignFilter, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortOrder,
        debug: '1',
      });
      if (search) params.set('search', search);
      if (campaignFilter && campaignFilter !== 'all') params.set('campaignId', campaignFilter);

      const res = await fetch(`/api/client-portal/qualified-leads?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch leads');
      return res.json();
    },
  });

  const leads = leadsResponse?.leads || [];
  const total = leadsResponse?.total || 0;
  const totalPages = Math.ceil(total / pageSize);
  const debugText = leadsResponse?.debug ? JSON.stringify(leadsResponse.debug, null, 2) : '';
  const leadsWithRecordings = leads.filter((lead) => lead.hasRecording).length;
  const leadsWithTranscripts = leads.filter((lead) => lead.hasTranscript).length;

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreBadge = (score: string | null) => {
    if (!score) return null;
    const numScore = parseFloat(score);
    if (numScore >= 80) return (
      
        {numScore.toFixed(0)}
      
    );
    if (numScore >= 60) return (
      
        {numScore.toFixed(0)}
      
    );
    return (
      
        {numScore.toFixed(0)}
      
    );
  };

  return (
    
      
        
          
            
            Qualified Leads
          
          
            
            {total.toLocaleString()}
            QA-approved leads from your campaigns
          
        
        
          
            
             {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          
           {
              setCampaignFilter(v);
              setPage(1);
            }}
          >
            
              
              
            
            
              
                All Campaigns
              
              {campaigns.map((c) => (
                
                  
                    {c.name}
                    
                      {c.approvedLeadsCount}
                    
                  
                
              ))}
            
          
           refetch()}
            className="h-10 w-10 hover:bg-blue-50 hover:border-blue-300 transition-colors"
          >
            
          
          
            
            Export
          
        
      
      
        
          
            Current Page
            {leads.length.toLocaleString()} leads
          
          
            With Recording
            {leadsWithRecordings.toLocaleString()}
          
          
            With Transcript
            {leadsWithTranscripts.toLocaleString()}
          
        

        {isLoading ? (
          
            
              
              Loading your leads...
            
          
        ) : leads.length === 0 ? (
          
            
            No Leads Found
            
              {search || campaignFilter !== 'all'
                ? 'No leads match your current filters. Try adjusting your search criteria.'
                : 'QA-approved leads from your campaigns will appear here once they are delivered.'}
            
            {debugText && (
              
                Diagnostics (copy/paste this)
                
                  {debugText}
                
              
            )}
          
        ) : (
          <>
            
              
                
                Scroll horizontally on smaller screens to view all columns.
              
              
              
                
                  
                    
                       handleSort('accountName')}
                      >
                        Contact
                        
                      
                    
                    Company
                    Campaign
                    
                       handleSort('aiScore')}
                      >
                        AI Score
                        
                      
                    
                    
                       handleSort('callDuration')}
                      >
                        Duration
                        
                      
                    
                    Assets
                    
                       handleSort('approvedAt')}
                      >
                        Approved
                        
                      
                    
                    Actions
                  
                
                
                  {leads.map((lead, idx) => (
                     onViewDetails(lead.id)}
                    >
                      
                        
                          {lead.contactName || 'Unknown'}
                          {lead.contactEmail || '-'}
                        
                      
                      
                        
                          
                            
                            {lead.companyName || lead.accountName || '-'}
                          
                          {lead.accountIndustry || '-'}
                        
                      
                      
                        
                          {lead.campaignName || '-'}
                        
                      
                      {getScoreBadge(lead.aiScore)}
                      
                        {formatDuration(lead.callDuration)}
                      
                      
                        
                          {lead.hasRecording && (
                            
                              
                            
                          )}
                          {lead.hasTranscript && (
                            
                              
                            
                          )}
                          {(lead.commentCount || 0) > 0 && (
                            
                              
                              {lead.commentCount}
                            
                          )}
                        
                      
                      
                        {lead.approvedAt
                          ? new Date(lead.approvedAt).toLocaleDateString()
                          : lead.createdAt
                          ? new Date(lead.createdAt).toLocaleDateString()
                          : '-'}
                      
                      
                        
                          {lead.callSessionId && (
                            
                          )}
                           {
                              e.stopPropagation();
                              onViewDetails(lead.id);
                            }}
                          >
                            
                            View
                          
                        
                      
                    
                  ))}
                
              
              
            

            {/* Modern Pagination */}
            
              
                Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, total)} of {total.toLocaleString()} leads
              
              
                 setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="hover:bg-blue-50"
                >
                  
                  Previous
                
                
                  
                    Page {page} of {totalPages}
                  
                
                 setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="hover:bg-blue-50"
                >
                  Next
                  
                
              
            
          
        )}
      
    
  );
}