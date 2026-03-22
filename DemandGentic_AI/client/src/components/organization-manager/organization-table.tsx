import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Crown, MoreHorizontal, Edit, Trash2, Users, Eye, Shield } from 'lucide-react';
import type { Organization } from './types';

interface OrganizationTableProps {
  organizations: Organization[];
  onEdit: (org: Organization) => void;
  onDelete: (org: Organization) => void;
  onViewMembers: (org: Organization) => void;
  onViewDetails: (org: Organization) => void;
}

const TYPE_BADGES: Record = {
  super: { label: 'Super', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  client: { label: 'Client', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  campaign: { label: 'Campaign', className: 'bg-purple-100 text-purple-800 border-purple-300' },
};

export function OrganizationTable({
  organizations,
  onEdit,
  onDelete,
  onViewMembers,
  onViewDetails,
}: OrganizationTableProps) {
  return (
    
      
        
          
            Name
            Type
            Domain
            Industry
            Status
            Members
            Created
            Actions
          
        
        
          {organizations.length === 0 ? (
            
              
                No organizations found
              
            
          ) : (
            organizations.map((org) => {
              const isSuper = org.organizationType === 'super';

              // Build type badges - an org can have multiple
              const badges: { label: string; className: string }[] = [];
              if (isSuper) {
                badges.push(TYPE_BADGES.super);
              }
              if (org.organizationType === 'client' || (org.organizationType !== 'super' && org.organizationType !== 'campaign')) {
                badges.push(TYPE_BADGES.client);
              }
              if (org.organizationType === 'campaign') {
                badges.push(TYPE_BADGES.campaign);
              }
              if (org.isCampaignOrg && org.organizationType !== 'campaign') {
                badges.push(TYPE_BADGES.campaign);
              }

              return (
                
                  
                     onViewDetails(org)}
                      className="flex items-center gap-2 font-medium hover:underline text-left"
                    >
                      {isSuper && }
                      {org.name}
                    
                  
                  
                    
                      {badges.map((badge) => (
                        
                          {badge.label}
                        
                      ))}
                    
                  
                  
                    {org.domain || '-'}
                  
                  
                    {org.industry || '-'}
                  
                  
                    {org.isActive ? (
                      
                        Active
                      
                    ) : (
                      
                        Inactive
                      
                    )}
                  
                  
                    {org.memberCount ?? 0}
                  
                  
                    {org.createdAt
                      ? new Date(org.createdAt).toLocaleDateString()
                      : '-'}
                  
                  
                    
                      
                        
                          
                        
                      
                      
                         onViewDetails(org)}>
                          
                          View Details
                        
                         onEdit(org)}>
                          
                          Edit
                        
                         onViewMembers(org)}>
                          
                          Members
                        
                        
                        {isSuper ? (
                          
                            
                              
                                
                                  
                                  Protected
                                
                              
                              
                                Super organization cannot be deleted
                              
                            
                          
                        ) : (
                           onDelete(org)}
                            className="text-destructive focus:text-destructive"
                          >
                            
                            Delete
                          
                        )}
                      
                    
                  
                
              );
            })
          )}
        
      
    
  );
}