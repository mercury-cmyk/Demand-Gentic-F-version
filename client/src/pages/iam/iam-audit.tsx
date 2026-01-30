/**
 * IAM Audit Log Page
 * 
 * View audit trail of all IAM-related actions
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  History, Search, ChevronLeft, Filter, Download,
  User, Users, Shield, Key, FileText, AlertTriangle, CheckCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface AuditEvent {
  id: string;
  actorId?: string;
  actorType?: string;
  actorIp?: string;
  actorUserAgent?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  targetUserId?: string;
  targetTeamId?: string;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
  changeDescription?: string;
  requestId?: string;
  reason?: string;
  organizationId?: string;
  createdAt: string;
}

const ACTION_TYPES = [
  { value: '', label: 'All Actions' },
  { value: 'team_created', label: 'Team Created' },
  { value: 'team_member_added', label: 'Team Member Added' },
  { value: 'role_created', label: 'Role Created' },
  { value: 'policy_created', label: 'Policy Created' },
  { value: 'grant_created', label: 'Grant Created' },
  { value: 'entity_assigned', label: 'Entity Assigned' },
  { value: 'access_request_created', label: 'Access Request' },
  { value: 'access_request_approved', label: 'Request Approved' },
  { value: 'access_request_denied', label: 'Request Denied' },
  { value: 'access_denied', label: 'Access Denied' },
];

const ENTITY_TYPES = [
  { value: '', label: 'All Entities' },
  { value: 'team', label: 'Teams' },
  { value: 'role', label: 'Roles' },
  { value: 'policy', label: 'Policies' },
  { value: 'account', label: 'Accounts' },
  { value: 'campaign', label: 'Campaigns' },
  { value: 'report', label: 'Reports' },
  { value: 'recording', label: 'Recordings' },
];

export default function IamAudit() {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  // Fetch audit events
  const { data: events, isLoading } = useQuery<AuditEvent[]>({
    queryKey: ['/api/iam/audit', actionFilter, entityFilter],
  });

  const getActionIcon = (action: string) => {
    if (action.includes('denied')) return <AlertTriangle className="h-4 w-4 text-red-500" />;
    if (action.includes('approved')) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (action.includes('team')) return <Users className="h-4 w-4 text-blue-500" />;
    if (action.includes('role')) return <Shield className="h-4 w-4 text-purple-500" />;
    if (action.includes('policy')) return <FileText className="h-4 w-4 text-orange-500" />;
    if (action.includes('grant')) return <Key className="h-4 w-4 text-yellow-500" />;
    return <History className="h-4 w-4 text-muted-foreground" />;
  };

  const getActionBadgeVariant = (action: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (action.includes('denied')) return 'destructive';
    if (action.includes('created') || action.includes('approved')) return 'default';
    if (action.includes('deleted') || action.includes('revoked')) return 'destructive';
    return 'secondary';
  };

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const filteredEvents = events?.filter(event => {
    const matchesSearch = 
      event.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.entityType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.reason?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesAction = !actionFilter || event.action === actionFilter;
    const matchesEntity = !entityFilter || event.entityType === entityFilter;
    
    return matchesSearch && matchesAction && matchesEntity;
  });

  const handleExport = () => {
    if (!filteredEvents) return;
    
    const csv = [
      ['Timestamp', 'Action', 'Entity Type', 'Entity ID', 'Actor', 'Reason'].join(','),
      ...filteredEvents.map(e => [
        new Date(e.createdAt).toISOString(),
        e.action,
        e.entityType || '',
        e.entityId || '',
        e.actorId || '',
        `"${(e.reason || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iam-audit-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/iam">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground">
            Track all IAM-related actions and changes
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={!filteredEvents?.length}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search audit events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map(type => (
                  <SelectItem key={type.value || 'all'} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by entity" />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map(type => (
                  <SelectItem key={type.value || 'all'} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Events</CardTitle>
          <CardDescription>
            {filteredEvents?.length ?? 0} events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : filteredEvents && filteredEvents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getActionIcon(event.action)}
                        <Badge variant={getActionBadgeVariant(event.action)}>
                          {formatAction(event.action)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {event.entityType ? (
                        <div>
                          <Badge variant="outline">{event.entityType}</Badge>
                          {event.entityId && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({event.entityId.slice(0, 8)}...)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {event.actorId ? event.actorId.slice(0, 8) + '...' : 'System'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {event.reason ? (
                        <span className="text-sm text-muted-foreground line-clamp-1">
                          {event.reason}
                        </span>
                      ) : event.changeDescription ? (
                        <span className="text-sm text-muted-foreground line-clamp-1">
                          {event.changeDescription}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedEvent(event);
                          setShowDetailsModal(true);
                        }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No audit events</h3>
              <p className="text-muted-foreground">
                Audit events will appear here as IAM actions are performed
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Event Details</DialogTitle>
            <DialogDescription>
              Event ID: {selectedEvent?.id}
            </DialogDescription>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Timestamp</Label>
                  <p className="font-medium">
                    {new Date(selectedEvent.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Action</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {getActionIcon(selectedEvent.action)}
                    <Badge variant={getActionBadgeVariant(selectedEvent.action)}>
                      {formatAction(selectedEvent.action)}
                    </Badge>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Entity Type</Label>
                  <p className="font-medium">{selectedEvent.entityType || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Entity ID</Label>
                  <p className="font-medium font-mono text-sm">
                    {selectedEvent.entityId || 'N/A'}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Actor ID</Label>
                  <p className="font-medium font-mono text-sm">
                    {selectedEvent.actorId || 'System'}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Actor Type</Label>
                  <p className="font-medium">{selectedEvent.actorType || 'user'}</p>
                </div>
              </div>
              
              {selectedEvent.actorIp && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">IP Address</Label>
                    <p className="font-medium font-mono text-sm">{selectedEvent.actorIp}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">User Agent</Label>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {selectedEvent.actorUserAgent || 'N/A'}
                    </p>
                  </div>
                </div>
              )}
              
              {selectedEvent.targetUserId && (
                <div>
                  <Label className="text-muted-foreground">Target User</Label>
                  <p className="font-medium font-mono text-sm">{selectedEvent.targetUserId}</p>
                </div>
              )}
              
              {selectedEvent.targetTeamId && (
                <div>
                  <Label className="text-muted-foreground">Target Team</Label>
                  <p className="font-medium font-mono text-sm">{selectedEvent.targetTeamId}</p>
                </div>
              )}
              
              {selectedEvent.reason && (
                <div>
                  <Label className="text-muted-foreground">Reason</Label>
                  <p className="mt-1 p-3 bg-muted rounded-md text-sm">
                    {selectedEvent.reason}
                  </p>
                </div>
              )}
              
              {selectedEvent.changeDescription && (
                <div>
                  <Label className="text-muted-foreground">Change Description</Label>
                  <p className="mt-1 p-3 bg-muted rounded-md text-sm">
                    {selectedEvent.changeDescription}
                  </p>
                </div>
              )}
              
              {selectedEvent.beforeState && Object.keys(selectedEvent.beforeState).length > 0 && (
                <div>
                  <Label className="text-muted-foreground">Before State</Label>
                  <pre className="mt-1 p-3 bg-red-50 dark:bg-red-950 rounded-md text-sm overflow-auto max-h-32">
                    {JSON.stringify(selectedEvent.beforeState, null, 2)}
                  </pre>
                </div>
              )}
              
              {selectedEvent.afterState && Object.keys(selectedEvent.afterState).length > 0 && (
                <div>
                  <Label className="text-muted-foreground">After State</Label>
                  <pre className="mt-1 p-3 bg-green-50 dark:bg-green-950 rounded-md text-sm overflow-auto max-h-32">
                    {JSON.stringify(selectedEvent.afterState, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
