import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Loader2, BarChart3, Phone, Mail, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const getToken = () => localStorage.getItem('clientPortalToken');

type ReportType = 'engagement' | 'call-reports' | 'leads';

const REPORT_TYPES: { value: ReportType; label: string; description: string; icon: typeof BarChart3 }[] = [
  { value: 'engagement', label: 'Engagement Report', description: 'Call, email, and lead activity summary', icon: BarChart3 },
  { value: 'call-reports', label: 'Call Reports', description: 'Detailed call dispositions and outcomes', icon: Phone },
  { value: 'leads', label: 'Leads Report', description: 'All leads with AI scores and status', icon: UserCheck },
];

export default function ClientPortalReportsExport() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [selectedReport, setSelectedReport] = useState<ReportType>('engagement');
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-reports-export'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
  });

  const campaigns = [
    ...(campaignsData?.verificationCampaigns || []),
    ...(campaignsData?.regularCampaigns || []),
  ];

  // Fetch preview data for the selected report type
  const { data: previewData, isLoading } = useQuery({
    queryKey: ['client-portal-report-preview', selectedReport, selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);

      const endpoints: Record<ReportType, string> = {
        engagement: '/api/client-portal/analytics/engagement',
        'call-reports': '/api/client-portal/call-reports',
        leads: '/api/client-portal/potential-leads',
      };

      const res = await fetch(`${endpoints[selectedReport]}?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch report data');
      return res.json();
    },
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      if (selectedReport === 'leads') {
        // Use the dedicated CSV export endpoint
        const params = new URLSearchParams();
        if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
        const res = await fetch(`/api/client-portal/leads/export?${params}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        downloadBlob(blob, `leads-report-${new Date().toISOString().split('T')[0]}.csv`);
      } else {
        // Generate CSV from preview data
        const csv = generateCSV(selectedReport, previewData);
        const blob = new Blob([csv], { type: 'text/csv' });
        downloadBlob(blob, `${selectedReport}-report-${new Date().toISOString().split('T')[0]}.csv`);
      }
      toast({ title: 'Export complete', description: `Your ${selectedReport} report has been downloaded.` });
    } catch {
      toast({ title: 'Export failed', description: 'Unable to export report. Please try again.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const generateCSV = (type: ReportType, data: any): string => {
    if (type === 'engagement') {
      const stats = data?.callStats || {};
      const emailStats = data?.emailStats || {};
      const leadStats = data?.leadStats || {};
      const rows = [
        ['Metric', 'Value'],
        ['Total Calls', stats.totalCalls || 0],
        ['Completed Calls', stats.completedCalls || 0],
        ['Avg Duration (sec)', stats.avgDuration || 0],
        ['Total Emails', emailStats.totalSent || 0],
        ['Email Opens', emailStats.totalOpened || 0],
        ['Email Clicks', emailStats.totalClicked || 0],
        ['Total Leads', leadStats.totalLeads || 0],
        ['Qualified Leads', leadStats.qualifiedLeads || 0],
      ];
      return rows.map(r => r.join(',')).join('\n');
    }

    if (type === 'call-reports') {
      const calls = data?.calls || [];
      const headers = ['Contact', 'Disposition', 'Duration (sec)', 'Date'];
      const rows = calls.map((c: any) => [
        `"${(c.contactName || '').replace(/"/g, '""')}"`,
        c.aiDisposition || 'unknown',
        c.durationSec || 0,
        c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : '',
      ]);
      return [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    }

    return '';
  };

  // Summary stats for preview
  const getPreviewSummary = () => {
    if (!previewData) return null;
    if (selectedReport === 'engagement') {
      return {
        items: [
          { label: 'Calls', value: previewData.callStats?.totalCalls || 0, icon: Phone },
          { label: 'Emails', value: previewData.emailStats?.totalSent || 0, icon: Mail },
          { label: 'Leads', value: previewData.leadStats?.totalLeads || 0, icon: UserCheck },
        ],
      };
    }
    if (selectedReport === 'call-reports') {
      const calls = previewData.calls || [];
      return {
        items: [
          { label: 'Total Calls', value: calls.length, icon: Phone },
          { label: 'With Recordings', value: calls.filter((c: any) => c.recordingUrl).length, icon: BarChart3 },
        ],
      };
    }
    if (selectedReport === 'leads') {
      const leads = Array.isArray(previewData) ? previewData : [];
      return {
        items: [
          { label: 'Total Leads', value: leads.length, icon: UserCheck },
          { label: 'High Score (70+)', value: leads.filter((l: any) => Number(l.aiScore) >= 70).length, icon: BarChart3 },
        ],
      };
    }
    return null;
  };

  const preview = getPreviewSummary();

  return (
    <ClientPortalLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-500/10 via-primary/5 to-transparent rounded-2xl p-6 md:p-8 border border-indigo-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Reports & Export</h1>
            </div>
            <p className="text-foreground/70 mt-2">Generate and download campaign reports in CSV format</p>
          </div>
        </div>

        {/* Report Type Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {REPORT_TYPES.map((report) => {
            const Icon = report.icon;
            const isActive = selectedReport === report.value;
            return (
              <Card
                key={report.value}
                className={`cursor-pointer transition-all ${isActive ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'}`}
                onClick={() => setSelectedReport(report.value)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isActive ? 'bg-primary/10' : 'bg-foreground/5'}`}>
                      <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-foreground/50'}`} />
                    </div>
                    <div>
                      <p className="font-medium">{report.label}</p>
                      <p className="text-xs text-foreground/50">{report.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filters + Export */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-foreground/70">Campaign</label>
                <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                  <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder="All Campaigns" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    {campaigns.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleExport} disabled={exporting || isLoading} className="gap-2">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export {REPORT_TYPES.find(r => r.value === selectedReport)?.label}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Report Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Report Preview</CardTitle>
            <CardDescription>Summary of data that will be exported</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : preview ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {preview.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex items-center gap-3 p-4 rounded-lg bg-foreground/5">
                      <Icon className="h-5 w-5 text-foreground/50" />
                      <div>
                        <p className="text-sm text-foreground/70">{item.label}</p>
                        <p className="text-xl font-bold">{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-foreground/50">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Select a report type and campaign to preview</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ClientPortalLayout>
  );
}
