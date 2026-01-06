import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Bot, 
  Phone, 
  TrendingUp, 
  Users, 
  CheckCircle,
  XCircle,
  Clock,
  ArrowRightLeft,
  Shield,
  MessageSquare,
  PhoneForwarded,
  BarChart3,
  Activity,
  PhoneCall,
  Loader2
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line
} from "recharts";

interface AiCallStats {
  totalAiCalls: number;
  qualified: number;
  handoffs: number;
  gatekeeperNavigations: number;
  voicemails: number;
  noAnswer: number;
  connected: number;
}

interface Campaign {
  id: string;
  name: string;
  dialMode: string;
}

const COLORS = {
  connected: 'hsl(var(--chart-1))',
  qualified: 'hsl(var(--chart-2))',
  handoffs: 'hsl(var(--chart-3))',
  gatekeeper: 'hsl(var(--chart-4))',
  voicemail: 'hsl(var(--chart-5))',
  noAnswer: 'hsl(var(--muted-foreground))',
};

const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];

export default function AiCallAnalyticsPage() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [testPhoneNumber, setTestPhoneNumber] = useState<string>('');
  const [testContactName, setTestContactName] = useState<string>('');
  const [batchLimit, setBatchLimit] = useState<number>(10);
  const { toast } = useToast();

  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
  });

  const testCallMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; contactFirstName: string; campaignId?: string }) => {
      const response = await apiRequest('POST', '/api/ai-calls/test-call', data);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Test Call Initiated",
        description: `Calling ${testPhoneNumber}... Your phone should ring shortly!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Test Call Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const batchCallMutation = useMutation({
    mutationFn: async (data: { campaignId: string; limit: number; delayBetweenCalls?: number }) => {
      const response = await apiRequest('POST', '/api/ai-calls/batch-start', data);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Campaign Launched!",
        description: `Started ${data.callsInitiated || 0} AI calls. ${data.message || ''}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Campaign Launch Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLaunchCampaign = () => {
    if (selectedCampaign === 'all') {
      toast({
        title: "Select a Campaign",
        description: "Please select a specific AI campaign to launch",
        variant: "destructive",
      });
      return;
    }
    
    batchCallMutation.mutate({
      campaignId: selectedCampaign,
      limit: batchLimit,
      delayBetweenCalls: 5000,
    });
  };

  const handleTestCall = () => {
    if (!testPhoneNumber || testPhoneNumber.length < 10) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number with country code",
        variant: "destructive",
      });
      return;
    }
    
    testCallMutation.mutate({
      phoneNumber: testPhoneNumber.startsWith('+') ? testPhoneNumber : `+1${testPhoneNumber}`,
      contactFirstName: testContactName || "Test",
      campaignId: selectedCampaign !== 'all' ? selectedCampaign : undefined,
    });
  };

  const aiCampaigns = campaigns.filter((c) => c.dialMode === 'ai_agent');

  const { data: stats, isLoading } = useQuery<AiCallStats>({
    queryKey: ['/api/ai-calls/campaign', selectedCampaign, 'stats', aiCampaigns.length],
    queryFn: async () => {
      if (selectedCampaign === 'all') {
        const campaignsToFetch = aiCampaigns.length > 0 ? aiCampaigns : [];
        
        if (campaignsToFetch.length === 0) {
          return {
            totalAiCalls: 0,
            qualified: 0,
            handoffs: 0,
            gatekeeperNavigations: 0,
            voicemails: 0,
            noAnswer: 0,
            connected: 0,
          };
        }
        
        const statsPromises = campaignsToFetch.map(async (campaign) => {
          try {
            const response = await fetch(`/api/ai-calls/campaign/${campaign.id}/stats`);
            if (response.ok) {
              return await response.json();
            }
          } catch {
          }
          return null;
        });
        
        const allStats = await Promise.all(statsPromises);
        
        return allStats.reduce((acc: AiCallStats, s) => {
          if (s) {
            acc.totalAiCalls += s.totalAiCalls || 0;
            acc.qualified += s.qualified || 0;
            acc.handoffs += s.handoffs || 0;
            acc.gatekeeperNavigations += s.gatekeeperNavigations || 0;
            acc.voicemails += s.voicemails || 0;
            acc.noAnswer += s.noAnswer || 0;
            acc.connected += s.connected || 0;
          }
          return acc;
        }, {
          totalAiCalls: 0,
          qualified: 0,
          handoffs: 0,
          gatekeeperNavigations: 0,
          voicemails: 0,
          noAnswer: 0,
          connected: 0,
        });
      }
      
      const response = await fetch(`/api/ai-calls/campaign/${selectedCampaign}/stats`);
      return response.json();
    },
    enabled: selectedCampaign !== 'all' || aiCampaigns.length >= 0,
  });

  const { data: activeCalls = [] } = useQuery<any[]>({
    queryKey: ['/api/ai-calls/active'],
  });

  const calculateRate = (numerator: number, denominator: number): string => {
    if (denominator === 0) return '0%';
    return `${Math.round((numerator / denominator) * 100)}%`;
  };

  const outcomeData = stats ? [
    { name: 'Connected', value: stats.connected, color: PIE_COLORS[0] },
    { name: 'Qualified', value: stats.qualified, color: PIE_COLORS[1] },
    { name: 'Handoffs', value: stats.handoffs, color: PIE_COLORS[2] },
    { name: 'Voicemail', value: stats.voicemails, color: PIE_COLORS[3] },
    { name: 'Gatekeeper', value: stats.gatekeeperNavigations, color: PIE_COLORS[4] },
    { name: 'No Answer', value: stats.noAnswer, color: PIE_COLORS[5] },
  ].filter(d => d.value > 0) : [];

  const performanceData = stats ? [
    { metric: 'Connection Rate', value: stats.totalAiCalls > 0 ? (stats.connected / stats.totalAiCalls) * 100 : 0 },
    { metric: 'Qualification Rate', value: stats.connected > 0 ? (stats.qualified / stats.connected) * 100 : 0 },
    { metric: 'Handoff Rate', value: stats.connected > 0 ? (stats.handoffs / stats.connected) * 100 : 0 },
    { metric: 'Gatekeeper Success', value: stats.gatekeeperNavigations > 0 ? ((stats.connected / (stats.gatekeeperNavigations + stats.connected)) * 100) : 100 },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="heading-ai-analytics">
            <Bot className="h-8 w-8" />
            AI Call Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Performance metrics for AI-powered outbound calling campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="w-[200px]" data-testid="select-campaign">
              <SelectValue placeholder="Select campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="select-item-all">All AI Campaigns</SelectItem>
              {aiCampaigns.map((c) => (
                <SelectItem key={c.id} value={c.id} data-testid={`select-item-campaign-${c.id}`}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Test Call Section */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5" />
            Test AI Call
          </CardTitle>
          <CardDescription>
            Make a test call to verify AI scripts and voice quality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label htmlFor="test-phone">Phone Number</Label>
              <Input
                id="test-phone"
                placeholder="+14175551234"
                value={testPhoneNumber}
                onChange={(e) => setTestPhoneNumber(e.target.value)}
                data-testid="input-test-phone"
              />
            </div>
            <div className="space-y-2 flex-1 min-w-[150px]">
              <Label htmlFor="test-name">Contact Name (optional)</Label>
              <Input
                id="test-name"
                placeholder="John"
                value={testContactName}
                onChange={(e) => setTestContactName(e.target.value)}
                data-testid="input-test-name"
              />
            </div>
            <Button 
              onClick={handleTestCall}
              disabled={testCallMutation.isPending}
              data-testid="button-test-call"
            >
              {testCallMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calling...
                </>
              ) : (
                <>
                  <Phone className="mr-2 h-4 w-4" />
                  Make Test Call
                </>
              )}
            </Button>
          </div>
          {selectedCampaign !== 'all' && (
            <p className="text-xs text-muted-foreground mt-3">
              Using scripts from: {aiCampaigns.find(c => c.id === selectedCampaign)?.name || 'Selected campaign'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Launch Campaign Section */}
      <Card className="border-green-500/30 bg-green-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <PhoneForwarded className="h-5 w-5" />
            Launch AI Campaign
          </CardTitle>
          <CardDescription>
            Start batch AI calls from your campaign queue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label htmlFor="launch-campaign">Select Campaign</Label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger data-testid="select-launch-campaign">
                  <SelectValue placeholder="Select AI campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">-- Select a campaign --</SelectItem>
                  {aiCampaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 w-32">
              <Label htmlFor="batch-limit">Calls to Make</Label>
              <Input
                id="batch-limit"
                type="number"
                min={1}
                max={50}
                value={batchLimit}
                onChange={(e) => setBatchLimit(Math.min(50, Math.max(1, parseInt(e.target.value) || 10)))}
                data-testid="input-batch-limit"
              />
            </div>
            <Button 
              onClick={handleLaunchCampaign}
              disabled={batchCallMutation.isPending || selectedCampaign === 'all'}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-launch-campaign"
            >
              {batchCallMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Launching...
                </>
              ) : (
                <>
                  <PhoneForwarded className="mr-2 h-4 w-4" />
                  Launch Campaign
                </>
              )}
            </Button>
          </div>
          {selectedCampaign !== 'all' && (
            <p className="text-xs text-muted-foreground mt-3">
              Will call up to {batchLimit} contacts from: {aiCampaigns.find(c => c.id === selectedCampaign)?.name || 'Selected campaign'}
            </p>
          )}
        </CardContent>
      </Card>

      {activeCalls.length > 0 && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-green-600">
              <Activity className="h-5 w-5 animate-pulse" />
              Active AI Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-lg px-4 py-2" data-testid="badge-active-calls">
                {activeCalls.length} calls in progress
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total AI Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-total-calls">
                {stats?.totalAiCalls || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Connected</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-connected">
                  {stats?.connected || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {calculateRate(stats?.connected || 0, stats?.totalAiCalls || 0)} connection rate
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Qualified Leads</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-qualified">
                  {stats?.qualified || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {calculateRate(stats?.qualified || 0, stats?.connected || 0)} of connected
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Human Handoffs</CardTitle>
            <PhoneForwarded className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-handoffs">
                  {stats?.handoffs || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Transferred to live agents
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Gatekeeper Navigations</CardTitle>
            <Shield className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-gatekeeper">
                {stats?.gatekeeperNavigations || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Voicemails</CardTitle>
            <MessageSquare className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-voicemails">
                {stats?.voicemails || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">No Answer</CardTitle>
            <XCircle className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-no-answer">
                {stats?.noAnswer || 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="outcomes" className="w-full">
        <TabsList>
          <TabsTrigger value="outcomes" data-testid="tab-outcomes">
            <BarChart3 className="mr-2 h-4 w-4" />
            Call Outcomes
          </TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-performance">
            <TrendingUp className="mr-2 h-4 w-4" />
            Performance Metrics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outcomes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Call Outcome Distribution</CardTitle>
              <CardDescription>
                Breakdown of AI call outcomes by disposition
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : outcomeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={outcomeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {outcomeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No AI call data available yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <CardDescription>
                Key performance indicators for AI calling campaigns
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : performanceData.length > 0 ? (
                <div className="space-y-6">
                  {performanceData.map((item, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{item.metric}</span>
                        <span className="text-sm text-muted-foreground">
                          {item.value.toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={item.value} className="h-2" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No performance data available yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {aiCampaigns.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No AI Campaigns Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create a campaign with "AI Agent" dial mode to start using AI-powered outbound calling.
            </p>
            <Button variant="outline" asChild data-testid="button-create-campaign">
              <a href="/campaigns/telemarketing/create">Create AI Campaign</a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
