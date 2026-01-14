/**
 * Intelligence Studio Dashboard
 *
 * Central hub for AI & Intelligence configuration.
 * Shows configuration hierarchy, quick stats, and navigation to all AI features.
 */

import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  Brain,
  Bot,
  Phone,
  ArrowRight,
  ChevronRight,
  Layers,
  MessageSquare,
  Zap,
  Settings,
  Play,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardStats {
  organizations: number;
  campaigns: number;
  virtualAgents: number;
  knowledgeBlocks: number;
}

export default function IntelligenceStudioDashboard() {
  const { token } = useAuth();

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/ai-studio/stats'],
    queryFn: async () => {
      // Fetch counts from various endpoints
      const [orgsRes, campaignsRes, agentsRes] = await Promise.all([
        fetch('/api/organization-intelligence', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/campaigns?type=call', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/virtual-agents', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const orgs = orgsRes.ok ? await orgsRes.json() : [];
      const campaigns = campaignsRes.ok ? await campaignsRes.json() : [];
      const agents = agentsRes.ok ? await agentsRes.json() : [];

      return {
        organizations: Array.isArray(orgs) ? orgs.length : 0,
        campaigns: Array.isArray(campaigns) ? campaigns.length : 0,
        virtualAgents: Array.isArray(agents) ? agents.length : 0,
        knowledgeBlocks: 0, // Will be populated when knowledge blocks API is available
      };
    },
    enabled: !!token,
  });

  const configurationSteps = [
    {
      step: 1,
      title: 'Organization Intelligence',
      description: 'Define your company profile, services, and messaging framework',
      icon: Building2,
      href: '/ai-studio/intelligence',
      color: 'bg-blue-500',
    },
    {
      step: 2,
      title: 'Virtual Agents',
      description: 'Create and configure AI voice agents with personalities',
      icon: Bot,
      href: '/virtual-agents',
      color: 'bg-purple-500',
    },
    {
      step: 3,
      title: 'Campaign Configuration',
      description: 'Bind intelligence and agents to campaigns',
      icon: Phone,
      href: '/ai-studio/campaign-intelligence',
      color: 'bg-green-500',
    },
    {
      step: 4,
      title: 'Preview & Test',
      description: 'Test agent behavior in Preview Studio',
      icon: Play,
      href: '/preview-studio',
      color: 'bg-amber-500',
    },
  ];

  const quickActions = [
    {
      title: 'Organization Intelligence',
      description: 'Configure company profile and messaging',
      icon: Brain,
      href: '/ai-studio/intelligence',
      badge: stats?.organizations ? `${stats.organizations} orgs` : null,
    },
    {
      title: 'Virtual Agents',
      description: 'Manage AI voice agents',
      icon: Bot,
      href: '/virtual-agents',
      badge: stats?.virtualAgents ? `${stats.virtualAgents} agents` : null,
    },
    {
      title: 'Preview Studio',
      description: 'Test and simulate conversations',
      icon: MessageSquare,
      href: '/preview-studio',
      badge: null,
    },
    {
      title: 'Campaign Bindings',
      description: 'Connect intelligence to campaigns',
      icon: Layers,
      href: '/ai-studio/campaign-intelligence',
      badge: stats?.campaigns ? `${stats.campaigns} campaigns` : null,
    },
  ];

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Intelligence Studio</h1>
        <p className="text-muted-foreground mt-2">
          Configure and manage your AI intelligence layer - from organization knowledge to voice
          agents
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.organizations || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Intelligence profiles</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Virtual Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.virtualAgents || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">AI voice agents</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.campaigns || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Phone campaigns</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Knowledge Blocks</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.knowledgeBlocks || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Reusable content</p>
          </CardContent>
        </Card>
      </div>

      {/* Configuration Flow */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Configuration Flow
          </CardTitle>
          <CardDescription>
            Follow this recommended sequence to set up your AI intelligence
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {configurationSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <Link key={step.step} href={step.href}>
                  <div className="relative group cursor-pointer">
                    <div className="flex flex-col items-center text-center p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                      <div
                        className={`${step.color} text-white p-3 rounded-full mb-3 group-hover:scale-110 transition-transform`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <Badge variant="outline" className="mb-2">
                        Step {step.step}
                      </Badge>
                      <h3 className="font-semibold text-sm">{step.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                    </div>
                    {index < configurationSteps.length - 1 && (
                      <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {quickActions.map(action => {
            const Icon = action.icon;
            return (
              <Link key={action.title} href={action.href}>
                <Card className="cursor-pointer hover:bg-accent/50 transition-colors h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{action.title}</CardTitle>
                          {action.badge && (
                            <Badge variant="secondary" className="mt-1 text-xs">
                              {action.badge}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{action.description}</CardDescription>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Configuration Hierarchy Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Configuration Hierarchy
          </CardTitle>
          <CardDescription>
            How intelligence flows from organization level to individual conversations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Hierarchy visualization */}
            <div className="flex flex-col gap-4">
              {/* Level 1: Organization */}
              <div className="flex items-center gap-4">
                <div className="w-32 text-right text-sm text-muted-foreground">System Level</div>
                <div className="flex-1 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    <span className="font-medium">Organization Intelligence</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Company profile, services, messaging framework, ICP definitions
                  </p>
                </div>
              </div>

              {/* Connector */}
              <div className="flex items-center gap-4">
                <div className="w-32"></div>
                <div className="flex-1 flex justify-center">
                  <div className="h-8 w-px bg-border"></div>
                </div>
              </div>

              {/* Level 2: Virtual Agents */}
              <div className="flex items-center gap-4">
                <div className="w-32 text-right text-sm text-muted-foreground">Agent Level</div>
                <div className="flex-1 p-4 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-purple-600" />
                    <span className="font-medium">Virtual Agents</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Agent personality, voice settings, conversation style, knowledge blocks
                  </p>
                </div>
              </div>

              {/* Connector */}
              <div className="flex items-center gap-4">
                <div className="w-32"></div>
                <div className="flex-1 flex justify-center">
                  <div className="h-8 w-px bg-border"></div>
                </div>
              </div>

              {/* Level 3: Campaign */}
              <div className="flex items-center gap-4">
                <div className="w-32 text-right text-sm text-muted-foreground">Campaign Level</div>
                <div className="flex-1 p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-green-600" />
                    <span className="font-medium">Campaign Configuration</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Campaign-specific overrides, target audience context, call objectives
                  </p>
                </div>
              </div>

              {/* Connector */}
              <div className="flex items-center gap-4">
                <div className="w-32"></div>
                <div className="flex-1 flex justify-center">
                  <div className="h-8 w-px bg-border"></div>
                </div>
              </div>

              {/* Level 4: Conversation */}
              <div className="flex items-center gap-4">
                <div className="w-32 text-right text-sm text-muted-foreground">Runtime</div>
                <div className="flex-1 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-amber-600" />
                    <span className="font-medium">Live Conversation</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Contact-specific context, real-time adaptation, dynamic responses
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
