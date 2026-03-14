import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, Phone, UserCheck, TrendingUp, Loader2, Target, AlertCircle, Sparkles } from "lucide-react";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";

const getToken = () => localStorage.getItem('clientPortalToken');

const DISPOSITION_COLORS: Record<string, string> = {
  qualified: '#22c55e',
  qualified_lead: '#16a34a',
  converted_qualified: '#15803d',
  not_interested: '#ef4444',
  callback_requested: '#f59e0b',
  voicemail: '#8b5cf6',
  no_answer: '#6b7280',
  busy: '#f97316',
  wrong_number: '#dc2626',
  do_not_call: '#991b1b',
  unknown: '#94a3b8',
};

const CHART_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#6b7280', '#f97316', '#ec4899', '#14b8a6', '#a855f7'];

interface DispositionData {
  dispositions: Array<{ disposition: string; count: number; avgDuration: number }>;
  timeline: Array<{ date: string; total: number; qualified: number; notInterested: number }>;
  totalCalls: number;
}

interface PotentialLead {
  id: string;
  contactName: string;
  contactEmail: string;
  accountName: string;
  campaignName: string;
  aiScore: string;
  aiQualificationStatus: string;
  qaStatus: string;
  createdAt: string;
}

export default function ClientPortalDisposition() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-disposition'],
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

  const { data: dispositionData, isLoading } = useQuery<DispositionData>({
    queryKey: ['client-portal-disposition', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/disposition-intelligence?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch disposition data');
      return res.json();
    },
  });

  const { data: potentialLeads = [], isLoading: leadsLoading } = useQuery<PotentialLead[]>({
    queryKey: ['client-portal-potential-leads', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/potential-leads?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch potential leads');
      return res.json();
    },
    enabled: activeTab === 'potential-leads',
  });

  const dispositions = dispositionData?.dispositions || [];
  const timeline = dispositionData?.timeline || [];
  const totalCalls = dispositionData?.totalCalls || 0;

  const qualifiedCount = dispositions
    .filter(d => ['qualified', 'qualified_lead', 'converted_qualified'].includes(d.disposition))
    .reduce((sum, d) => sum + d.count, 0);
  const conversionRate = totalCalls > 0 ? ((qualifiedCount / totalCalls) * 100).toFixed(1) : '0';

  const pieData = dispositions.slice(0, 8).map(d => ({
    name: d.disposition.replace(/_/g, ' '),
    value: d.count,
    fill: DISPOSITION_COLORS[d.disposition] || '#94a3b8',
  }));

  return (
    <ClientPortalLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-violet-500/10 via-primary/5 to-transparent rounded-2xl p-6 md:p-8 border border-violet-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-lg">
                <Target className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Disposition Intelligence</h1>
            </div>
            <p className="text-foreground/70 mt-2">AI-powered call disposition analysis with trends and lead identification</p>
          </div>
        </div>

        {/* Campaign Filter */}
        <Card>
          <CardContent className="pt-6">
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
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Phone className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground/70">Total Calls</p>
                      <p className="text-2xl font-bold">{totalCalls.toLocaleString()}</p>
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
                      <p className="text-2xl font-bold">{qualifiedCount.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground/70">Conversion Rate</p>
                      <p className="text-2xl font-bold">{conversionRate}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-violet-500" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground/70">Dispositions</p>
                      <p className="text-2xl font-bold">{dispositions.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="trends">Trends</TabsTrigger>
                <TabsTrigger value="potential-leads">Potential Leads</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6 mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Pie Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Disposition Breakdown</CardTitle>
                      <CardDescription>Distribution of call outcomes</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                              {pieData.map((_, i) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Disposition Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Detailed Breakdown</CardTitle>
                      <CardDescription>All dispositions with metrics</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[300px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Disposition</TableHead>
                              <TableHead className="text-right">Count</TableHead>
                              <TableHead className="text-right">%</TableHead>
                              <TableHead className="text-right">Avg Duration</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dispositions.map((d) => (
                              <TableRow key={d.disposition}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DISPOSITION_COLORS[d.disposition] || '#94a3b8' }} />
                                    <span className="capitalize">{d.disposition.replace(/_/g, ' ')}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">{d.count}</TableCell>
                                <TableCell className="text-right text-foreground/70">
                                  {totalCalls > 0 ? ((d.count / totalCalls) * 100).toFixed(1) : '0'}%
                                </TableCell>
                                <TableCell className="text-right text-foreground/70">
                                  {Math.floor(d.avgDuration / 60)}:{String(d.avgDuration % 60).padStart(2, '0')}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="trends" className="space-y-6 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">30-Day Disposition Trends</CardTitle>
                    <CardDescription>Daily call volume with qualified vs not-interested outcomes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px]">
                      {timeline.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={timeline}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} />
                            <Legend />
                            <Bar dataKey="total" name="Total Calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="qualified" name="Qualified" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="notInterested" name="Not Interested" fill="#ef4444" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-foreground/50">
                          <div className="text-center">
                            <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p>No trend data available yet</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="potential-leads" className="space-y-6 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-amber-500" />
                      AI-Identified Potential Leads
                    </CardTitle>
                    <CardDescription>Leads with high AI scores showing buying signals</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {leadsLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : potentialLeads.length === 0 ? (
                      <div className="text-center py-8 text-foreground/50">
                        <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No potential leads identified yet</p>
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
                            {potentialLeads.map((lead) => (
                              <TableRow key={lead.id}>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{lead.contactName || 'Unknown'}</p>
                                    <p className="text-xs text-foreground/50">{lead.contactEmail || ''}</p>
                                  </div>
                                </TableCell>
                                <TableCell>{lead.accountName || '—'}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">{lead.campaignName}</Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge className={Number(lead.aiScore) >= 70 ? 'bg-green-500/10 text-green-600' : Number(lead.aiScore) >= 50 ? 'bg-amber-500/10 text-amber-600' : 'bg-gray-500/10 text-gray-600'}>
                                    {lead.aiScore}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="capitalize text-xs">{(lead.qaStatus || lead.aiQualificationStatus || 'pending').replace(/_/g, ' ')}</Badge>
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
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ClientPortalLayout>
  );
}
