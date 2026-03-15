/**
 * Campaign Intelligence Bindings Page
 *
 * Manages the relationships between campaigns and intelligence configurations.
 * Shows which campaigns use which organization intelligence and virtual agents.
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Phone,
  Bot,
  Building2,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Campaign {
  id: number;
  name: string;
  type: string;
  status: string;
  dialMode?: string;
  aiAgentId?: number;
  organizationIntelligenceId?: number;
}

interface VirtualAgent {
  id: number;
  name: string;
  voiceProvider: string;
}

interface OrganizationIntelligence {
  id: number;
  name: string;
}

export default function CampaignIntelligencePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { token } = useAuth();

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
    enabled: !!token,
  });

  // Fetch virtual agents
  const { data: virtualAgents = [], isLoading: agentsLoading } = useQuery<VirtualAgent[]>({
    queryKey: ['/api/virtual-agents'],
    queryFn: async () => {
      const response = await fetch('/api/virtual-agents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch virtual agents');
      return response.json();
    },
    enabled: !!token,
  });

  // Fetch organization intelligence
  const { data: orgIntelligence = [], isLoading: orgLoading } = useQuery<OrganizationIntelligence[]>(
    {
      queryKey: ['/api/organization-intelligence'],
      queryFn: async () => {
        const response = await fetch('/api/organization-intelligence', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return [];
        return response.json();
      },
      enabled: !!token,
    }
  );

  const isLoading = campaignsLoading || agentsLoading || orgLoading;

  // Filter to phone campaigns only
  const phoneCampaigns = campaigns.filter(
    c => c.type === 'call' || c.type === 'telemarketing'
  );

  const filteredCampaigns = phoneCampaigns.filter(campaign =>
    campaign.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper to get agent name
  const getAgentName = (agentId?: number) => {
    if (!agentId) return null;
    const agent = virtualAgents.find(a => a.id === agentId);
    return agent?.name || `Agent #${agentId}`;
  };

  // Helper to get org intelligence name
  const getOrgIntelligenceName = (orgId?: number) => {
    if (!orgId) return null;
    const org = orgIntelligence.find(o => o.id === orgId);
    return org?.name || `Organization #${orgId}`;
  };

  const getStatusBadge = (status: string) => {
    const config: Record<
      string,
      { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }
    > = {
      active: { variant: 'default', className: 'bg-green-500' },
      draft: { variant: 'secondary' },
      paused: { variant: 'outline', className: 'border-amber-300 text-amber-700' },
      completed: { variant: 'outline' },
    };
    const { variant, className } = config[status] || { variant: 'outline' as const };
    return (
      <Badge variant={variant} className={className}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaign Intelligence Bindings</h1>
          <p className="text-muted-foreground mt-2">
            View and manage how intelligence configurations are connected to campaigns
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/ai-studio/intelligence">
              <Building2 className="h-4 w-4 mr-2" />
              Org Intelligence
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/ai-studio/agents">
              <Bot className="h-4 w-4 mr-2" />
              Virtual Agents
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Phone Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{phoneCampaigns.length}</div>
            <p className="text-xs text-muted-foreground">
              {phoneCampaigns.filter(c => c.dialMode === 'ai_agent').length} using AI agents
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Virtual Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{virtualAgents.length}</div>
            <p className="text-xs text-muted-foreground">Available for campaigns</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Intelligence Profiles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orgIntelligence.length}</div>
            <p className="text-xs text-muted-foreground">Organization configurations</p>
          </CardContent>
        </Card>
      </div>

      {/* Bindings Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Campaign Bindings</CardTitle>
              <CardDescription>
                Phone campaigns and their intelligence configuration assignments
              </CardDescription>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-10 w-10 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium">No campaigns found</h3>
              <p className="text-sm mt-1">
                {searchQuery
                  ? 'No campaigns match your search'
                  : 'Create a phone campaign to get started'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Virtual Agent</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCampaigns.map(campaign => {
                    const agentName = getAgentName(campaign.aiAgentId);
                    const orgName = getOrgIntelligenceName(campaign.organizationIntelligenceId);
                    const isAiMode = campaign.dialMode === 'ai_agent';

                    return (
                      <TableRow key={campaign.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{campaign.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                        <TableCell>
                          {isAiMode ? (
                            <Badge variant="outline" className="border-purple-300 text-purple-700">
                              <Bot className="h-3 w-3 mr-1" />
                              AI Agent
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              {campaign.dialMode || 'manual'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {agentName ? (
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <span>{agentName}</span>
                            </div>
                          ) : isAiMode ? (
                            <div className="flex items-center gap-2 text-amber-600">
                              <AlertCircle className="h-4 w-4" />
                              <span className="text-sm">Not configured</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {orgName ? (
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <span>{orgName}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Not assigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/campaigns/phone/${campaign.id}/edit`}>
                              <Settings className="h-4 w-4 mr-1" />
                              Configure
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visual Binding Flow */}
      <Card>
        <CardHeader>
          <CardTitle>Intelligence Flow</CardTitle>
          <CardDescription>
            How intelligence configurations connect to produce AI behavior
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 py-8">
            <div className="flex flex-col items-center text-center p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/30 min-w-[200px]">
              <Building2 className="h-8 w-8 text-blue-600 mb-2" />
              <h3 className="font-semibold">Organization</h3>
              <p className="text-xs text-muted-foreground">Company knowledge base</p>
            </div>
            <ArrowRight className="h-6 w-6 text-muted-foreground hidden md:block" />
            <div className="h-6 w-px bg-border md:hidden" />
            <div className="flex flex-col items-center text-center p-4 border rounded-lg bg-purple-50 dark:bg-purple-950/30 min-w-[200px]">
              <Bot className="h-8 w-8 text-purple-600 mb-2" />
              <h3 className="font-semibold">Virtual Agent</h3>
              <p className="text-xs text-muted-foreground">AI personality & voice</p>
            </div>
            <ArrowRight className="h-6 w-6 text-muted-foreground hidden md:block" />
            <div className="h-6 w-px bg-border md:hidden" />
            <div className="flex flex-col items-center text-center p-4 border rounded-lg bg-green-50 dark:bg-green-950/30 min-w-[200px]">
              <Phone className="h-8 w-8 text-green-600 mb-2" />
              <h3 className="font-semibold">Campaign</h3>
              <p className="text-xs text-muted-foreground">Audience & objectives</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
