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
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [includeTranscripts, setIncludeTranscripts] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch campaigns for filter dropdown
  const { data: campaigns = [] } = useQuery<Campaign[]>({
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Leads
          </DialogTitle>
          <DialogDescription>
            Download your qualified leads as a CSV file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Campaign Filter</Label>
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Campaigns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Campaigns</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.approvedLeadsCount} leads)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {totalLeads.toLocaleString()} leads will be exported
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="include-transcripts"
              checked={includeTranscripts}
              onCheckedChange={(checked) => setIncludeTranscripts(checked === true)}
            />
            <Label htmlFor="include-transcripts" className="text-sm cursor-pointer">
              Include call transcripts in export
            </Label>
          </div>
          {includeTranscripts && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 ml-6">
              <FileText className="h-3 w-3" />
              Note: Including transcripts will significantly increase file size
            </p>
          )}

          <div className="rounded-lg border p-4 bg-muted/50">
            <h4 className="text-sm font-medium mb-2">Included Fields</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>- Lead ID</span>
              <span>- Contact Name</span>
              <span>- Email</span>
              <span>- Account Name</span>
              <span>- Industry</span>
              <span>- Campaign</span>
              <span>- AI Score</span>
              <span>- Call Duration</span>
              <span>- Phone Dialed</span>
              <span>- Approved Date</span>
              <span>- Created Date</span>
              {includeTranscripts && <span>- Transcript</span>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || totalLeads === 0}>
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export {totalLeads.toLocaleString()} Leads
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
