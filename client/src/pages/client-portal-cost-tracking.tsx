import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DollarSign, Phone, Mail, UserCheck, TrendingUp, Loader2, Clock, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const getToken = () => localStorage.getItem('clientPortalToken');

interface CostData {
  summary: {
    totalCalls: number;
    totalDurationMinutes: number;
    totalEmails: number;
    totalLeads: number;
    qualifiedLeads: number;
  };
  campaignBreakdown: Array<{
    campaignId: string;
    campaignName: string;
    calls: number;
    emails: number;
    qualifiedLeads: number;
  }>;
}

export default function ClientPortalCostTracking() {
  const { data, isLoading } = useQuery<CostData>({
    queryKey: ['client-portal-cost-tracking'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/cost-tracking', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch cost data');
      return res.json();
    },
  });

  const summary = data?.summary;
  const breakdown = data?.campaignBreakdown || [];

  return (
    <ClientPortalLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-primary/5 to-transparent rounded-2xl p-6 md:p-8 border border-emerald-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Cost & Activity Tracking</h1>
            </div>
            <p className="text-foreground/70 mt-2">Track activity volumes and resource usage across all your campaigns</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Phone className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground/70">Total Calls</p>
                      <p className="text-2xl font-bold">{(summary?.totalCalls || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground/70">Call Minutes</p>
                      <p className="text-2xl font-bold">{(summary?.totalDurationMinutes || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                      <Mail className="h-5 w-5 text-cyan-500" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground/70">Emails Sent</p>
                      <p className="text-2xl font-bold">{(summary?.totalEmails || 0).toLocaleString()}</p>
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
                      <p className="text-sm text-foreground/70">Total Leads</p>
                      <p className="text-2xl font-bold">{(summary?.totalLeads || 0).toLocaleString()}</p>
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
                      <p className="text-sm text-foreground/70">Qualified Leads</p>
                      <p className="text-2xl font-bold">{(summary?.qualifiedLeads || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Campaign Comparison Chart */}
            {breakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Campaign Activity Comparison
                  </CardTitle>
                  <CardDescription>Side-by-side activity breakdown per campaign</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={breakdown}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="campaignName" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="calls" name="Calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="emails" name="Emails" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="qualifiedLeads" name="Qualified Leads" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Campaign Breakdown Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Campaign Breakdown</CardTitle>
                <CardDescription>Detailed activity per campaign</CardDescription>
              </CardHeader>
              <CardContent>
                {breakdown.length === 0 ? (
                  <div className="text-center py-8 text-foreground/50">
                    <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No campaign activity recorded yet</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Campaign</TableHead>
                          <TableHead className="text-right">Calls</TableHead>
                          <TableHead className="text-right">Emails</TableHead>
                          <TableHead className="text-right">Qualified Leads</TableHead>
                          <TableHead className="text-right">Efficiency</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {breakdown.map((row) => {
                          const totalActivity = row.calls + row.emails;
                          const efficiency = totalActivity > 0 ? ((row.qualifiedLeads / totalActivity) * 100).toFixed(1) : '0';
                          return (
                            <TableRow key={row.campaignId}>
                              <TableCell className="font-medium">{row.campaignName}</TableCell>
                              <TableCell className="text-right">{row.calls.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{row.emails.toLocaleString()}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline" className="bg-green-500/10 text-green-600">{row.qualifiedLeads}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-foreground/70">{efficiency}%</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ClientPortalLayout>
  );
}
