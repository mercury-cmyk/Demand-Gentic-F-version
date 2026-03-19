/**
 * Unified Report Sections
 *
 * Content sections for each tab in the unified Reports & Analytics page.
 * Each section manages its own data fetching and campaign filter state.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, Phone, Mail, UserCheck, TrendingUp, Clock, Star, DollarSign,
  Download, Loader2, Activity, Mic, CheckCircle, XCircle, FileText,
  MessageSquareText, ChevronDown, ChevronUp, Users, Brain,
  Voicemail, PhoneOff, Ban,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const getToken = () => localStorage.getItem('clientPortalToken');
const COLORS = ['hsl(142, 76%, 36%)', 'hsl(221, 83%, 53%)', 'hsl(262, 83%, 58%)', 'hsl(45, 93%, 47%)', 'hsl(0, 84%, 60%)'];
const DISPOSITION_COLORS: Record<string, string> = {
  qualified: 'hsl(142, 76%, 36%)',
  not_interested: 'hsl(0, 84%, 60%)',
  voicemail: 'hsl(221, 83%, 53%)',
  no_answer: 'hsl(45, 93%, 47%)',
  dnc_request: 'hsl(0, 72%, 51%)',
  busy: 'hsl(262, 83%, 58%)',
  callback_requested: 'hsl(199, 89%, 48%)',
};

const formatDuration = (seconds?: number | null) => {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function CampaignFilter({ value, onChange, campaigns }: { value: string; onChange: (v: string) => void; campaigns: any[] }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="max-w-sm">
          <label className="text-sm font-medium mb-2 block">Campaign</label>
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
  );
}

// ─── ENGAGEMENT SECTION ──────────────────────────────────
export function EngagementSection({ campaigns }: { campaigns: any[] }) {
  const [selectedCampaign, setSelectedCampaign] = useState('all');

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['unified-engagement', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/analytics/engagement?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch engagement analytics');
      return res.json();
    },
  });

  const behaviorData = analytics?.agentBehavior ? [
    { metric: "Engagement", score: analytics.agentBehavior.engagement || 0 },
    { metric: "Clarity", score: analytics.agentBehavior.clarity || 0 },
    { metric: "Empathy", score: analytics.agentBehavior.empathy || 0 },
    { metric: "Objection", score: analytics.agentBehavior.objectionHandling || 0 },
    { metric: "Qualification", score: analytics.agentBehavior.qualification || 0 },
    { metric: "Closing", score: analytics.agentBehavior.closing || 0 },
    { metric: "Flow", score: analytics.agentBehavior.flowCompliance || 0 },
  ] : [];

  return (
    <div className="space-y-6">
      <CampaignFilter value={selectedCampaign} onChange={setSelectedCampaign} campaigns={campaigns} />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Campaigns", value: analytics?.totalCampaigns || 0, icon: BarChart3, color: "text-blue-500" },
              { label: "Emails", value: analytics?.email?.total || 0, icon: Mail, color: "text-green-500" },
              { label: "Calls", value: analytics?.calls?.total || 0, icon: Phone, color: "text-purple-500" },
              { label: "Qualified", value: analytics?.leads?.qualified || 0, icon: UserCheck, color: "text-orange-500" },
            ].map(s => (
              <Card key={s.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{s.label}</CardTitle>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{s.value.toLocaleString()}</div></CardContent>
              </Card>
            ))}
          </div>

          {analytics?.timeline?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.timeline}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" /><YAxis /><Tooltip /><Legend />
                    <Line type="monotone" dataKey="calls" stroke="hsl(262, 83%, 58%)" name="Calls" />
                    <Line type="monotone" dataKey="emails" stroke="hsl(142, 76%, 36%)" name="Emails" />
                    <Line type="monotone" dataKey="qualified" stroke="hsl(45, 93%, 47%)" name="Qualified" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {analytics?.channelBreakdown?.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Channel Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={analytics.channelBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {analytics.channelBreakdown.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
            {analytics?.dispositions?.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Dispositions</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={analytics.dispositions}>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="disposition" /><YAxis /><Tooltip />
                      <Bar dataKey="count" fill="hsl(221, 83%, 53%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {behaviorData.length > 0 && analytics?.agentBehavior?.sampleSize > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-primary" />Agent Behaviour Analysis</CardTitle>
                <CardDescription>Averaged from {analytics.agentBehavior.sampleSize} analyzed calls</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={behaviorData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="metric" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} /><Tooltip />
                    <Bar dataKey="score" fill="hsl(262, 83%, 58%)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {analytics?.recentCalls?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recent Calls</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contact</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Disposition</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.recentCalls.map((call: any) => (
                        <TableRow key={`${call.source}-${call.id}`}>
                          <TableCell className="font-medium">{call.contactName || "Unknown"}</TableCell>
                          <TableCell>
                            <Badge variant={call.source === "sample" ? "secondary" : "outline"}>
                              {call.source === "sample" ? "Sample" : "Live"}
                            </Badge>
                          </TableCell>
                          <TableCell>{(call.disposition || "unknown").replace(/_/g, " ")}</TableCell>
                          <TableCell>{formatDuration(call.duration)}</TableCell>
                          <TableCell>{call.behaviorScore ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── CALLS SECTION ───────────────────────────────────────
export function CallsSection({ campaigns }: { campaigns: any[] }) {
  const [selectedCampaign, setSelectedCampaign] = useState('all');

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['unified-calls', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/call-reports?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch call reports');
      return res.json();
    },
  });

  const summary = reportData?.summary || { totalCalls: 0, totalDuration: 0, avgDuration: 0 };
  const dispositions = reportData?.dispositions || [];
  const campaignBreakdown = reportData?.campaignBreakdown || [];

  const getDispositionIcon = (d: string) => {
    switch (d) {
      case 'qualified': return CheckCircle;
      case 'not_interested': return XCircle;
      case 'voicemail': return Voicemail;
      case 'no_answer': return PhoneOff;
      case 'dnc_request': return Ban;
      default: return Phone;
    }
  };

  return (
    <div className="space-y-6">
      <CampaignFilter value={selectedCampaign} onChange={setSelectedCampaign} campaigns={campaigns} />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{summary.totalCalls.toLocaleString()}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{formatDuration(summary.totalDuration)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{formatDuration(summary.avgDuration)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{campaignBreakdown.length}</div></CardContent>
            </Card>
          </div>

          {dispositions.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Call Dispositions</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {dispositions.map((d: any) => {
                      const Icon = getDispositionIcon(d.disposition);
                      return (
                        <div key={d.disposition} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <span className="text-sm capitalize">{d.disposition.replace(/_/g, ' ')}</span>
                          </div>
                          <Badge variant="secondary">{d.count}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Disposition Chart</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={dispositions} dataKey="count" nameKey="disposition" cx="50%" cy="50%" outerRadius={80} label>
                        {dispositions.map((e: any, i: number) => (
                          <Cell key={i} fill={DISPOSITION_COLORS[e.disposition] || '#ccc'} />
                        ))}
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {campaignBreakdown.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Campaign Performance</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Qualified</TableHead>
                      <TableHead className="text-right">Not Interested</TableHead>
                      <TableHead className="text-right">Voicemail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignBreakdown.map((c: any) => (
                      <TableRow key={c.campaignId}>
                        <TableCell className="font-medium">{c.campaignName}</TableCell>
                        <TableCell className="text-right">{c.totalCalls}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="bg-green-500/10 text-green-600">{c.qualified}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{c.notInterested}</TableCell>
                        <TableCell className="text-right">{c.voicemail}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── QUALITY SECTION ─────────────────────────────────────
export function QualitySection({ campaigns }: { campaigns: any[] }) {
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: conversations = [], isLoading } = useQuery<any[]>({
    queryKey: ['unified-quality', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/conversations?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch conversations');
      return res.json();
    },
  });

  const avgQuality = conversations.length > 0
    ? Math.round(conversations.reduce((sum, c) => sum + (c.qualityScore || 0), 0) / (conversations.filter(c => c.qualityScore).length || 1))
    : 0;
  const qaApproved = conversations.filter(c => c.qaStatus === 'approved').length;
  const qaRejected = conversations.filter(c => c.qaStatus === 'rejected').length;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <CampaignFilter value={selectedCampaign} onChange={setSelectedCampaign} campaigns={campaigns} />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Conversations</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{conversations.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Avg Quality</CardTitle>
                <Star className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{avgQuality}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">QA Approved</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold text-green-600">{qaApproved}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">QA Rejected</CardTitle>
                <XCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold text-red-600">{qaRejected}</div></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
              <CardDescription>Click a row to expand quality analysis and transcript</CardDescription>
            </CardHeader>
            <CardContent>
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageSquareText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold">No Conversations Yet</h3>
                  <p className="text-muted-foreground mt-2">Data will appear once calls are made.</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {conversations.map((conv: any) => (
                      <div key={conv.id} className="border rounded-lg overflow-hidden">
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedId(expandedId === conv.id ? null : conv.id); }}
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{conv.contactName}</p>
                            <p className="text-sm text-muted-foreground truncate">{conv.accountName} — {conv.campaignName}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <Badge variant="outline" className="capitalize">{conv.disposition?.replace(/_/g, ' ') || 'N/A'}</Badge>
                            {conv.qualityScore !== null && (
                              <Badge variant={conv.qualityScore >= 70 ? 'default' : 'destructive'}>{conv.qualityScore}%</Badge>
                            )}
                            {conv.qaStatus && (
                              <Badge variant={conv.qaStatus === 'approved' ? 'default' : 'destructive'}>{conv.qaStatus}</Badge>
                            )}
                            <span className="text-sm text-muted-foreground">{formatDuration(conv.duration || 0)}</span>
                            {expandedId === conv.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>
                        {expandedId === conv.id && (
                          <div className="border-t p-4 bg-muted/30 space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {[
                                { label: "Engagement", score: conv.engagementScore },
                                { label: "Clarity", score: conv.clarityScore },
                                { label: "Empathy", score: conv.empathyScore },
                                { label: "Objection Handling", score: conv.objectionHandlingScore },
                                { label: "Qualification", score: conv.qualificationScore },
                                { label: "Closing", score: conv.closingScore },
                                { label: "Flow Compliance", score: conv.flowComplianceScore },
                                { label: "Campaign Alignment", score: conv.campaignAlignmentScore },
                              ].filter(d => d.score != null).map(d => (
                                <div key={d.label} className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span>{d.label}</span>
                                    <span className={getScoreColor(d.score)}>{Math.round(d.score)}%</span>
                                  </div>
                                  <Progress value={d.score} className="h-1.5" />
                                </div>
                              ))}
                            </div>
                            {conv.sentiment && (
                              <div className="text-sm">
                                <span className="text-muted-foreground">Sentiment: </span>
                                <Badge variant="outline" className="capitalize">{conv.sentiment}</Badge>
                              </div>
                            )}
                            {conv.transcript && (
                              <div className="mt-3">
                                <p className="text-sm font-medium mb-1">Transcript</p>
                                <ScrollArea className="h-[200px] rounded-md border p-3 bg-background">
                                  <pre className="text-xs whitespace-pre-wrap font-mono">{conv.transcript}</pre>
                                </ScrollArea>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── RECORDINGS SECTION ──────────────────────────────────
export function RecordingsSection({ campaigns }: { campaigns: any[] }) {
  const [selectedCampaign, setSelectedCampaign] = useState('all');

  const { data: recordings = [], isLoading } = useQuery<any[]>({
    queryKey: ['unified-recordings', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/recordings?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch recordings');
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <CampaignFilter value={selectedCampaign} onChange={setSelectedCampaign} campaigns={campaigns} />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : recordings.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Mic className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No Recordings Available</h3>
            <p className="text-muted-foreground mt-2">Recordings will appear once calls are recorded.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              Call Recordings ({recordings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <div className="space-y-3">
                {recordings.map((rec: any) => (
                  <div key={rec.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{rec.contactName}</p>
                        <p className="text-sm text-muted-foreground">{rec.campaignName} — {new Date(rec.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">{(rec.disposition || 'unknown').replace(/_/g, ' ')}</Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(rec.duration)}
                        </span>
                      </div>
                    </div>
                    {rec.recordingUrl && (
                      <audio controls className="w-full h-8" src={rec.recordingUrl} preload="none" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── COST SECTION ────────────────────────────────────────
export function CostSection() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['unified-cost-tracking'],
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
    <div className="space-y-6">
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Total Calls", value: summary?.totalCalls || 0, icon: Phone, color: "text-blue-500", bg: "bg-blue-500/10" },
              { label: "Call Minutes", value: summary?.totalDurationMinutes || 0, icon: Clock, color: "text-purple-500", bg: "bg-purple-500/10" },
              { label: "Emails Sent", value: summary?.totalEmails || 0, icon: Mail, color: "text-cyan-500", bg: "bg-cyan-500/10" },
              { label: "Total Leads", value: summary?.totalLeads || 0, icon: TrendingUp, color: "text-amber-500", bg: "bg-amber-500/10" },
              { label: "Qualified", value: summary?.qualifiedLeads || 0, icon: UserCheck, color: "text-green-500", bg: "bg-green-500/10" },
            ].map(kpi => (
              <Card key={kpi.label}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                      <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{kpi.label}</p>
                      <p className="text-2xl font-bold">{kpi.value.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {breakdown.length > 0 && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Campaign Activity Comparison
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={breakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="campaignName" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                      <YAxis /><Tooltip /><Legend />
                      <Bar dataKey="calls" name="Calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="emails" name="Emails" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="qualifiedLeads" name="Qualified Leads" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Campaign Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                        <TableHead className="text-right">Emails</TableHead>
                        <TableHead className="text-right">Qualified</TableHead>
                        <TableHead className="text-right">Efficiency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {breakdown.map((row: any) => {
                        const total = row.calls + row.emails;
                        const eff = total > 0 ? ((row.qualifiedLeads / total) * 100).toFixed(1) : '0';
                        return (
                          <TableRow key={row.campaignId}>
                            <TableCell className="font-medium">{row.campaignName}</TableCell>
                            <TableCell className="text-right">{row.calls.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{row.emails.toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="bg-green-500/10 text-green-600">{row.qualifiedLeads}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{eff}%</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── EXPORT SECTION ──────────────────────────────────────
type ReportType = 'engagement' | 'call-reports' | 'leads';

const REPORT_TYPES: { value: ReportType; label: string; description: string; icon: typeof BarChart3 }[] = [
  { value: 'engagement', label: 'Engagement Report', description: 'Call, email, and lead activity summary', icon: BarChart3 },
  { value: 'call-reports', label: 'Call Reports', description: 'Detailed call dispositions and outcomes', icon: Phone },
  { value: 'leads', label: 'Leads Report', description: 'All leads with AI scores and status', icon: UserCheck },
];

export function ExportSection({ campaigns }: { campaigns: any[] }) {
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [selectedReport, setSelectedReport] = useState<ReportType>('engagement');
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const { data: previewData, isLoading } = useQuery({
    queryKey: ['unified-export-preview', selectedReport, selectedCampaign],
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
      if (!res.ok) throw new Error('Failed to fetch preview');
      return res.json();
    },
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      if (selectedReport === 'leads') {
        const params = new URLSearchParams();
        if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
        const res = await fetch(`/api/client-portal/leads/export?${params}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        downloadBlob(blob, `leads-report-${new Date().toISOString().split('T')[0]}.csv`);
      } else {
        const csv = generateCSV(selectedReport, previewData);
        const blob = new Blob([csv], { type: 'text/csv' });
        downloadBlob(blob, `${selectedReport}-report-${new Date().toISOString().split('T')[0]}.csv`);
      }
      toast({ title: 'Export complete', description: `Your ${selectedReport} report has been downloaded.` });
    } catch {
      toast({ title: 'Export failed', description: 'Unable to export report.', variant: 'destructive' });
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
      return [
        ['Metric', 'Value'],
        ['Total Campaigns', data?.totalCampaigns || 0],
        ['Total Calls', data?.calls?.total || 0],
        ['Emails Sent', data?.email?.total || 0],
        ['Qualified Leads', data?.leads?.qualified || 0],
      ].map(r => r.join(',')).join('\n');
    }
    if (type === 'call-reports') {
      const dispositions = data?.dispositions || [];
      return [
        ['Disposition', 'Count'],
        ...dispositions.map((d: any) => [d.disposition, d.count]),
      ].map(r => r.join(',')).join('\n');
    }
    return '';
  };

  const getPreview = () => {
    if (!previewData) return null;
    if (selectedReport === 'engagement') {
      return [
        { label: 'Calls', value: previewData.calls?.total || 0, icon: Phone },
        { label: 'Emails', value: previewData.email?.total || 0, icon: Mail },
        { label: 'Qualified', value: previewData.leads?.qualified || 0, icon: UserCheck },
      ];
    }
    if (selectedReport === 'call-reports') {
      return [
        { label: 'Total Calls', value: previewData.summary?.totalCalls || 0, icon: Phone },
        { label: 'Dispositions', value: previewData.dispositions?.length || 0, icon: BarChart3 },
      ];
    }
    if (selectedReport === 'leads') {
      const leads = Array.isArray(previewData) ? previewData : [];
      return [
        { label: 'Total Leads', value: leads.length, icon: UserCheck },
        { label: 'High Score (70+)', value: leads.filter((l: any) => Number(l.aiScore) >= 70).length, icon: BarChart3 },
      ];
    }
    return null;
  };

  const preview = getPreview();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {REPORT_TYPES.map((report) => {
          const Icon = report.icon;
          const isActive = selectedReport === report.value;
          return (
            <Card
              key={report.value}
              className={`cursor-pointer transition-all ${isActive ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'}`}
              onClick={() => setSelectedReport(report.value)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedReport(report.value); }}
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isActive ? 'bg-primary/10' : 'bg-foreground/5'}`}>
                    <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-foreground/50'}`} />
                  </div>
                  <div>
                    <p className="font-medium">{report.label}</p>
                    <p className="text-xs text-muted-foreground">{report.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Campaign</label>
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
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Report Preview</CardTitle>
          <CardDescription>Summary of data that will be exported</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : preview ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {preview.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">{item.label}</p>
                      <p className="text-xl font-bold">{item.value.toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Select a report type to preview</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
