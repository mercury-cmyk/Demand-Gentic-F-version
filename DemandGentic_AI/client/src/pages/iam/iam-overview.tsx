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
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/iam/stats'],
  });

  const { data: recentAudit, isLoading: auditLoading } = useQuery({
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
    
      
        {title}
        
      
      
        {statsLoading ? (
          
        ) : (
          {value ?? 0}
        )}
        {description && (
          {description}
        )}
        {link && (
          
            
              View all 
            
          
        )}
      
    
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
    
      {/* Header */}
      
        
          Access Management
          
            Manage users, teams, roles, and permissions across your organization
          
        
        
          
            
              
              Access Requests
              {stats?.pendingAccessRequests ? (
                
                  {stats.pendingAccessRequests}
                
              ) : null}
            
          
          
            
              
              New Grant
            
          
        
      

      {/* Stats Grid */}
      
        
        
        
        
      

      
         0 ? 'warning' : 'default'}
        />
        
         5 ? 'danger' : 'default'}
        />
      

      {/* Quick Actions & Recent Activity */}
      
        {/* Quick Actions */}
        
          
            Quick Actions
            Common IAM operations
          
          
            
              
                
                Manage Users
              
            
            
              
                
                Manage Teams
              
            
            
              
                
                Configure Roles
              
            
            
              
                
                Edit Policies
              
            
            
              
                
                Manage Secrets
              
            
            
              
                
                View Audit Log
              
            
          
        

        {/* Recent Activity */}
        
          
            Recent Activity
            Latest IAM audit events
          
          
            {auditLoading ? (
              
                {[1, 2, 3, 4, 5].map(i => (
                  
                ))}
              
            ) : recentAudit && recentAudit.length > 0 ? (
              
                {recentAudit.slice(0, 5).map((event) => (
                  
                    
                      
                        {formatAction(event.action)}
                      
                      
                        {event.entityType && `${event.entityType}`}
                      
                    
                    
                      {new Date(event.createdAt).toLocaleString()}
                    
                  
                ))}
                
                  
                    View all events 
                  
                
              
            ) : (
              
                No recent activity
              
            )}
          
        
      

      {/* Entity Access Matrix Preview */}
      
        
          Entity Types Overview
          
            Controllable resources in the system
          
        
        
          
            {[
              'account', 'project', 'campaign', 'agent', 'call_session',
              'recording', 'transcript', 'report', 'lead', 'delivery',
              'domain', 'smtp', 'email_template', 'prompt', 'quality_review'
            ].map(entity => (
              
                {entity.replace(/_/g, ' ')}
              
            ))}
          
        
      
    
  );
}