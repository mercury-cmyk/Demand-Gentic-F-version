import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Phone,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Voicemail,
  PhoneOff,
  Ban,
  Download,
  Loader2,
  Users,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

const getToken = () => localStorage.getItem('clientPortalToken');

const COLORS: Record<string, string> = {
  qualified: 'hsl(142, 76%, 36%)',
  not_interested: 'hsl(0, 84%, 60%)',
  voicemail: 'hsl(221, 83%, 53%)',
  no_answer: 'hsl(45, 93%, 47%)',
  dnc_request: 'hsl(0, 72%, 51%)',
  busy: 'hsl(262, 83%, 58%)',
  callback_requested: 'hsl(199, 89%, 48%)',
};

const getDispositionIcon = (disposition: string) => {
  switch (disposition) {
    case 'qualified': return CheckCircle;
    case 'not_interested': return XCircle;
    case 'voicemail': return Voicemail;
    case 'no_answer': return PhoneOff;
    case 'dnc_request': return Ban;
    default: return Phone;
  }
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export default function ClientPortalCallReports() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');

  // Fetch client's campaigns
  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-reports'],
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

  // Fetch call reports
  const { data: reportData, isLoading } = useQuery({
    queryKey: ['client-portal-call-reports', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/call-reports?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch reports');
      return res.json();
    },
  });

  const summary = reportData?.summary || { totalCalls: 0, totalDuration: 0, avgDuration: 0 };
  const dispositions = reportData?.dispositions || [];
  const campaignBreakdown = reportData?.campaignBreakdown || [];

  return (
    <ClientPortalLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-2xl p-6 md:p-8 border border-primary/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
                  <Phone className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Call Reports</h1>
              </div>
              <p className="text-foreground/70 mt-2">Performance metrics for your campaigns</p>
            </div>
          </div>
        </div>

        {/* Campaign Filter */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-sm">
              <label className="text-sm font-medium mb-2 block">Campaign</label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
                  <Phone className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.totalCalls.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Duration</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatDuration(summary.totalDuration)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatDuration(summary.avgDuration)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{campaignBreakdown.length}</div>
                </CardContent>
              </Card>
            </div>

            {/* Disposition Breakdown */}
            {dispositions.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Call Dispositions</CardTitle>
                    <CardDescription>Breakdown of call outcomes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      {dispositions.map((disp: any) => {
                        const Icon = getDispositionIcon(disp.disposition);
                        return (
                          <div key={disp.disposition} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span className="text-sm capitalize">{disp.disposition.replace(/_/g, ' ')}</span>
                            </div>
                            <Badge variant="secondary">{disp.count}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Disposition Chart</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={dispositions}
                          dataKey="count"
                          nameKey="disposition"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label
                        >
                          {dispositions.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[entry.disposition] || '#ccc'} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Campaign Breakdown */}
            {campaignBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {campaignBreakdown.map((campaign: any) => (
                      <div key={campaign.campaignId} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="font-semibold">{campaign.campaignName}</h4>
                          <Badge>{campaign.totalCalls} calls</Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">Qualified</p>
                            <p className="font-semibold text-green-600">{campaign.qualified}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Not Interested</p>
                            <p className="font-semibold">{campaign.notInterested}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Voicemail</p>
                            <p className="font-semibold">{campaign.voicemail}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">No Answer</p>
                            <p className="font-semibold">{campaign.noAnswer}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">DNC</p>
                            <p className="font-semibold text-red-600">{campaign.dncRequest}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {summary.totalCalls === 0 && (
              <Card className="border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <Phone className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold">No Call Data Yet</h3>
                  <p className="text-muted-foreground mt-2 max-w-md">
                    Call reports will appear here once campaigns start making calls.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ClientPortalLayout>
  );
}
