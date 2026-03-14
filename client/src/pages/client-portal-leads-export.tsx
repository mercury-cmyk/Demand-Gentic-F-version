import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Users, Loader2, UserCheck, Search, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const getToken = () => localStorage.getItem('clientPortalToken');

interface Lead {
  id: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  accountName: string;
  accountIndustry: string;
  campaignName: string;
  aiScore: string;
  qaStatus: string;
  aiQualificationStatus: string;
  createdAt: string;
}

export default function ClientPortalLeadsExport() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-leads'],
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

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['client-portal-potential-leads-all', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/potential-leads?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch leads');
      return res.json();
    },
  });

  const allLeads: Lead[] = leadsData || [];
  const filteredLeads = allLeads.filter((lead) => {
    if (statusFilter === 'qualified' && !['approved', 'published'].includes(lead.qaStatus)) return false;
    if (statusFilter === 'pending' && lead.qaStatus !== 'pending') return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        (lead.contactName || '').toLowerCase().includes(term) ||
        (lead.contactEmail || '').toLowerCase().includes(term) ||
        (lead.accountName || '').toLowerCase().includes(term)
      );
    }
    return true;
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      if (statusFilter === 'qualified') params.append('status', 'qualified');

      const res = await fetch(`/api/client-portal/leads/export?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      toast({ title: 'Export complete', description: 'Your leads have been exported to CSV.' });
    } catch {
      toast({ title: 'Export failed', description: 'Unable to export leads. Please try again.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const qualifiedCount = allLeads.filter(l => ['approved', 'published'].includes(l.qaStatus)).length;

  return (
    <ClientPortalLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-sky-500/10 via-primary/5 to-transparent rounded-2xl p-6 md:p-8 border border-sky-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center shadow-lg">
                  <Users className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Leads & Export</h1>
                  <p className="text-foreground/70 mt-1">View, search, and export your campaign leads</p>
                </div>
              </div>
              <Button onClick={handleExport} disabled={exporting || allLeads.length === 0} className="gap-2">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-foreground/70">Total Leads</p>
                  <p className="text-2xl font-bold">{allLeads.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <UserCheck className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-foreground/70">Qualified</p>
                  <p className="text-2xl font-bold">{qualifiedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Search className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm text-foreground/70">Showing</p>
                  <p className="text-2xl font-bold">{filteredLeads.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground/70">Campaign</label>
                <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                  <SelectTrigger className="w-[250px]">
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
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground/70">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Leads</SelectItem>
                    <SelectItem value="qualified">Qualified Only</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Search by name, email, or account..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-[300px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Leads Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Leads</CardTitle>
            <CardDescription>{filteredLeads.length} leads matching your filters</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-12 text-foreground/50">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No leads found matching your filters</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead className="text-right">AI Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{lead.contactName || 'Unknown'}</p>
                            <p className="text-xs text-foreground/50">{lead.contactEmail || ''}</p>
                            {lead.contactPhone && <p className="text-xs text-foreground/40">{lead.contactPhone}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{lead.accountName || '—'}</p>
                            {lead.accountIndustry && <p className="text-xs text-foreground/50">{lead.accountIndustry}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{lead.campaignName}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className={Number(lead.aiScore) >= 70 ? 'bg-green-500/10 text-green-600' : Number(lead.aiScore) >= 50 ? 'bg-amber-500/10 text-amber-600' : 'bg-gray-500/10 text-gray-600'}>
                            {lead.aiScore || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={['approved', 'published'].includes(lead.qaStatus) ? 'default' : 'outline'} className="capitalize text-xs">
                            {(lead.qaStatus || 'pending').replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-foreground/70 text-sm">
                          {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </ClientPortalLayout>
  );
}
