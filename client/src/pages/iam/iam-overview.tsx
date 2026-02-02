/**
 * IAM Overview Dashboard
 * 
 * Main dashboard for Identity and Access Management showing:
 * - Key metrics (users, teams, roles, policies, pending requests)
 * - Recent audit events
 * - Quick actions
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  Users, Shield, Key, FileText, Clock, AlertTriangle, 
  UserPlus, Settings, History, ChevronRight, Layers
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface IamStats {
  totalUsers: number;
  totalTeams: number;
  totalRoles: number;
  totalPolicies: number;
  pendingAccessRequests: number;
  activeGrants: number;
  highRiskPermissions: number;
}

interface AuditEvent {
  id: string;
  action: string;
  actorId: string;
  entityType?: string;
  entityId?: string;
  createdAt: string;
}

export default function IamOverview() {
  const { data: stats, isLoading: statsLoading } = useQuery<IamStats>({
    queryKey: ['/api/iam/stats'],
  });

  const { data: recentAudit, isLoading: auditLoading } = useQuery<AuditEvent[]>({
    queryKey: ['/api/iam/audit'],
  });

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    description, 
    link,
    variant = 'default'
  }: { 
    title: string; 
    value: number | undefined; 
    icon: React.ElementType; 
    description?: string;
    link?: string;
    variant?: 'default' | 'warning' | 'danger';
  }) => (
    <Card className={`transition-all hover:shadow-md ${
      variant === 'warning' ? 'border-yellow-500' : 
      variant === 'danger' ? 'border-red-500' : ''
    }`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${
          variant === 'warning' ? 'text-yellow-500' : 
          variant === 'danger' ? 'text-red-500' : 
          'text-muted-foreground'
        }`} />
      </CardHeader>
      <CardContent>
        {statsLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-bold">{value ?? 0}</div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {link && (
          <Link href={link}>
            <Button variant="link" className="p-0 h-auto mt-2 text-xs">
              View all <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getActionBadgeVariant = (action: string) => {
    if (action.includes('denied')) return 'destructive';
    if (action.includes('created')) return 'default';
    if (action.includes('deleted')) return 'destructive';
    if (action.includes('approved')) return 'default';
    return 'secondary';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Access Management</h1>
          <p className="text-muted-foreground">
            Manage users, teams, roles, and permissions across your organization
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/iam/requests">
            <Button variant="outline">
              <Clock className="h-4 w-4 mr-2" />
              Access Requests
              {stats?.pendingAccessRequests ? (
                <Badge variant="destructive" className="ml-2">
                  {stats.pendingAccessRequests}
                </Badge>
              ) : null}
            </Button>
          </Link>
          <Link href="/iam/grants">
            <Button>
              <Key className="h-4 w-4 mr-2" />
              New Grant
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Users" 
          value={stats?.totalUsers} 
          icon={Users}
          link="/iam/users"
        />
        <StatCard 
          title="Teams" 
          value={stats?.totalTeams} 
          icon={Layers}
          link="/iam/teams"
        />
        <StatCard 
          title="Roles" 
          value={stats?.totalRoles} 
          icon={Shield}
          link="/iam/roles"
        />
        <StatCard 
          title="Policies" 
          value={stats?.totalPolicies} 
          icon={FileText}
          link="/iam/policies"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard 
          title="Pending Requests" 
          value={stats?.pendingAccessRequests} 
          icon={Clock}
          description="Access requests awaiting approval"
          link="/iam/requests"
          variant={stats?.pendingAccessRequests && stats.pendingAccessRequests > 0 ? 'warning' : 'default'}
        />
        <StatCard 
          title="Active Grants" 
          value={stats?.activeGrants} 
          icon={Key}
          description="Direct permission grants in effect"
          link="/iam/grants"
        />
        <StatCard 
          title="High-Risk Permissions" 
          value={stats?.highRiskPermissions} 
          icon={AlertTriangle}
          description="Sensitive access grants to review"
          variant={stats?.highRiskPermissions && stats.highRiskPermissions > 5 ? 'danger' : 'default'}
        />
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
            <CardDescription>Common IAM operations</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Link href="/iam/users">
              <Button variant="outline" className="w-full justify-start">
                <UserPlus className="h-4 w-4 mr-2" />
                Manage Users
              </Button>
            </Link>
            <Link href="/iam/teams">
              <Button variant="outline" className="w-full justify-start">
                <Layers className="h-4 w-4 mr-2" />
                Manage Teams
              </Button>
            </Link>
            <Link href="/iam/roles">
              <Button variant="outline" className="w-full justify-start">
                <Shield className="h-4 w-4 mr-2" />
                Configure Roles
              </Button>
            </Link>
            <Link href="/iam/policies">
              <Button variant="outline" className="w-full justify-start">
                <FileText className="h-4 w-4 mr-2" />
                Edit Policies
              </Button>
            </Link>
            <Link href="/iam/secrets">
              <Button variant="outline" className="w-full justify-start">
                <Key className="h-4 w-4 mr-2" />
                Manage Secrets
              </Button>
            </Link>
            <Link href="/iam/audit">
              <Button variant="outline" className="w-full justify-start">
                <History className="h-4 w-4 mr-2" />
                View Audit Log
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <CardDescription>Latest IAM audit events</CardDescription>
          </CardHeader>
          <CardContent>
            {auditLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentAudit && recentAudit.length > 0 ? (
              <div className="space-y-3">
                {recentAudit.slice(0, 5).map((event) => (
                  <div 
                    key={event.id} 
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant={getActionBadgeVariant(event.action)}>
                        {formatAction(event.action)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {event.entityType && `${event.entityType}`}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
                <Link href="/iam/audit">
                  <Button variant="link" className="p-0 h-auto">
                    View all events <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recent activity
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Entity Access Matrix Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Entity Types Overview</CardTitle>
          <CardDescription>
            Controllable resources in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              'account', 'project', 'campaign', 'agent', 'call_session',
              'recording', 'transcript', 'report', 'lead', 'delivery',
              'domain', 'smtp', 'email_template', 'prompt', 'quality_review'
            ].map(entity => (
              <Badge key={entity} variant="outline">
                {entity.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
