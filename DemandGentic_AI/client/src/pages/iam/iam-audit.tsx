/**
 * IAM Audit Log Page
 * 
 * View audit trail of all IAM-related actions
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useExportAuthority } from '@/hooks/use-export-authority';
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
  beforeState?: Record;
  afterState?: Record;
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
  const [selectedEvent, setSelectedEvent] = useState(null);
  const { canExportData } = useExportAuthority();

  // Fetch audit events
  const { data: events, isLoading } = useQuery({
    queryKey: ['/api/iam/audit', actionFilter, entityFilter],
  });

  const getActionIcon = (action: string) => {
    if (action.includes('denied')) return ;
    if (action.includes('approved')) return ;
    if (action.includes('team')) return ;
    if (action.includes('role')) return ;
    if (action.includes('policy')) return ;
    if (action.includes('grant')) return ;
    return ;
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
    
      {/* Header */}
      
        
          
            
          
        
        
          Audit Log
          
            Track all IAM-related actions and changes
          
        
        {canExportData && (
          
            
            Export CSV
          
        )}
      

      {/* Filters */}
      
        
          
            
              
               setSearchQuery(e.target.value)}
                className="pl-10"
              />
            
            
            
              
                
              
              
                {ACTION_TYPES.map(type => (
                  
                    {type.label}
                  
                ))}
              
            
            
            
              
                
              
              
                {ENTITY_TYPES.map(type => (
                  
                    {type.label}
                  
                ))}
              
            
          
        
      

      {/* Audit Events Table */}
      
        
          Audit Events
          
            {filteredEvents?.length ?? 0} events
          
        
        
          {isLoading ? (
            
              {[1, 2, 3, 4, 5].map(i => )}
            
          ) : filteredEvents && filteredEvents.length > 0 ? (
            
              
                
                  Timestamp
                  Action
                  Entity
                  Actor
                  Details
                  View
                
              
              
                {filteredEvents.map((event) => (
                  
                    
                      {new Date(event.createdAt).toLocaleString()}
                    
                    
                      
                        {getActionIcon(event.action)}
                        
                          {formatAction(event.action)}
                        
                      
                    
                    
                      {event.entityType ? (
                        
                          {event.entityType}
                          {event.entityId && (
                            
                              ({event.entityId.slice(0, 8)}...)
                            
                          )}
                        
                      ) : (
                        -
                      )}
                    
                    
                      
                        
                        
                          {event.actorId ? event.actorId.slice(0, 8) + '...' : 'System'}
                        
                      
                    
                    
                      {event.reason ? (
                        
                          {event.reason}
                        
                      ) : event.changeDescription ? (
                        
                          {event.changeDescription}
                        
                      ) : (
                        -
                      )}
                    
                    
                       {
                          setSelectedEvent(event);
                          setShowDetailsModal(true);
                        }}
                      >
                        View
                      
                    
                  
                ))}
              
            
          ) : (
            
              
              No audit events
              
                Audit events will appear here as IAM actions are performed
              
            
          )}
        
      

      {/* Event Details Modal */}
      
        
          
            Audit Event Details
            
              Event ID: {selectedEvent?.id}
            
          
          
          {selectedEvent && (
            
              
                
                  Timestamp
                  
                    {new Date(selectedEvent.createdAt).toLocaleString()}
                  
                
                
                  Action
                  
                    {getActionIcon(selectedEvent.action)}
                    
                      {formatAction(selectedEvent.action)}
                    
                  
                
              
              
              
                
                  Entity Type
                  {selectedEvent.entityType || 'N/A'}
                
                
                  Entity ID
                  
                    {selectedEvent.entityId || 'N/A'}
                  
                
              
              
              
                
                  Actor ID
                  
                    {selectedEvent.actorId || 'System'}
                  
                
                
                  Actor Type
                  {selectedEvent.actorType || 'user'}
                
              
              
              {selectedEvent.actorIp && (
                
                  
                    IP Address
                    {selectedEvent.actorIp}
                  
                  
                    User Agent
                    
                      {selectedEvent.actorUserAgent || 'N/A'}
                    
                  
                
              )}
              
              {selectedEvent.targetUserId && (
                
                  Target User
                  {selectedEvent.targetUserId}
                
              )}
              
              {selectedEvent.targetTeamId && (
                
                  Target Team
                  {selectedEvent.targetTeamId}
                
              )}
              
              {selectedEvent.reason && (
                
                  Reason
                  
                    {selectedEvent.reason}
                  
                
              )}
              
              {selectedEvent.changeDescription && (
                
                  Change Description
                  
                    {selectedEvent.changeDescription}
                  
                
              )}
              
              {selectedEvent.beforeState && Object.keys(selectedEvent.beforeState).length > 0 && (
                
                  Before State
                  
                    {JSON.stringify(selectedEvent.beforeState, null, 2)}
                  
                
              )}
              
              {selectedEvent.afterState && Object.keys(selectedEvent.afterState).length > 0 && (
                
                  After State
                  
                    {JSON.stringify(selectedEvent.afterState, null, 2)}
                  
                
              )}
            
          )}
        
      
    
  );
}