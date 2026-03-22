import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Download, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Campaign {
  id: string;
  name: string;
  approvedLeadsCount: number;
}

interface ExportLeadsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportLeadsDialog({ open, onClose }: ExportLeadsDialogProps) {
  const { toast } = useToast();
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [includeTranscripts, setIncludeTranscripts] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch campaigns for filter dropdown
  const { data: campaigns = [] } = useQuery({
    queryKey: ['client-portal-lead-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/qualified-leads/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (campaignFilter && campaignFilter !== 'all') {
        params.set('campaignId', campaignFilter);
      }
      if (includeTranscripts) {
        params.set('includeTranscripts', 'true');
      }

      const res = await fetch(`/api/client-portal/qualified-leads/export?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) {
        throw new Error('Export failed');
      }

      // Get the filename from content-disposition header or use default
      const contentDisposition = res.headers.get('content-disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || `qualified-leads-${new Date().toISOString().split('T')[0]}.csv`;

      // Create blob and download
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: 'Export successful', description: `Downloaded ${filename}` });
      onClose();
    } catch (error) {
      toast({ title: 'Export failed', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const totalLeads = campaignFilter === 'all'
    ? campaigns.reduce((sum, c) => sum + c.approvedLeadsCount, 0)
    : campaigns.find(c => c.id === campaignFilter)?.approvedLeadsCount || 0;

  return (
     !o && onClose()}>
      
        
          
            
            Export Leads
          
          
            Download your qualified leads as a CSV file
          
        

        
          
            Campaign Filter
            
              
                
              
              
                All Campaigns
                {campaigns.map((c) => (
                  
                    {c.name} ({c.approvedLeadsCount} leads)
                  
                ))}
              
            
            
              {totalLeads.toLocaleString()} leads will be exported
            
          

          
             setIncludeTranscripts(checked === true)}
            />
            
              Include call transcripts in export
            
          
          {includeTranscripts && (
            
              
              Note: Including transcripts will significantly increase file size
            
          )}

          
            Included Fields
            
              - Lead ID
              - Contact Name
              - Email
              - Account Name
              - Industry
              - Campaign
              - AI Score
              - Call Duration
              - Phone Dialed
              - Approved Date
              - Created Date
              {includeTranscripts && - Transcript}
            
          
        

        
          
            Cancel
          
          
            {isExporting ? (
              <>
                
                Exporting...
              
            ) : (
              <>
                
                Export {totalLeads.toLocaleString()} Leads
              
            )}
          
        
      
    
  );
}