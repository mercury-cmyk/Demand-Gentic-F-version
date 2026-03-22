import { useQuery } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Crown, Building2, Megaphone, Edit, Users, Globe, Briefcase, FileText } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import type { Organization, OrganizationMember } from './types';

interface OrganizationDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: Organization | null;
  onEdit: (org: Organization) => void;
  onViewMembers: (org: Organization) => void;
}

const TYPE_CONFIG = {
  super: { icon: Crown, color: 'text-amber-500', label: 'Super Organization', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300' },
  client: { icon: Building2, color: 'text-blue-500', label: 'Client Organization', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300' },
  campaign: { icon: Megaphone, color: 'text-purple-500', label: 'Campaign Organization', badgeClass: 'bg-purple-100 text-purple-800 border-purple-300' },
};

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    
      {label}
      {value}
    
  );
}

function JsonSection({ label, data }: { label: string; data: any }) {
  if (!data || Object.keys(data).length === 0) return null;

  const entries = Object.entries(data).filter(
    ([, v]: [string, any]) => v && (typeof v === 'string' ? v.trim() : v.value)
  );

  if (entries.length === 0) return null;

  return (
    
      {label}
      
        {entries.map(([key, val]: [string, any]) => (
          
            
              {key.replace(/([A-Z])/g, ' $1').trim()}
            
            
              {typeof val === 'string' ? val : val?.value || JSON.stringify(val)}
            
          
        ))}
      
    
  );
}

export function OrganizationDetailPanel({
  open,
  onOpenChange,
  organization,
  onEdit,
  onViewMembers,
}: OrganizationDetailPanelProps) {
  const { data: membersData } = useQuery({
    queryKey: ['/api/organizations', organization?.id, 'members'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/organizations/${organization!.id}/members`);
      return res.json() as Promise;
    },
    enabled: !!organization?.id && open,
  });

  if (!organization) return null;

  const typeConfig = TYPE_CONFIG[organization.organizationType] || TYPE_CONFIG.client;
  const TypeIcon = typeConfig.icon;
  const members = membersData?.members || [];

  return (
    
      
        
          
            
            {organization.name}
          
          
            
              {typeConfig.label}
            
            {organization.isCampaignOrg && organization.organizationType !== 'campaign' && (
              
                Campaign
              
            )}
            {organization.isActive ? (
              Active
            ) : (
              Inactive
            )}
          
        

        
          {/* Actions */}
          
             onEdit(organization)}>
               Edit
            
             onViewMembers(organization)}>
               Members ({organization.memberCount ?? members.length})
            
          

          

          {/* Basic Info */}
          
            
               Basic Information
            
            
            
            
            
          

          {/* Intelligence Sections */}
          {(organization.identity || organization.offerings || organization.icp || organization.positioning) && (
            <>
              
              
                
                   Organization Intelligence
                
                
                
                
                
              
            
          )}

          {/* Members Preview */}
          {members.length > 0 && (
            <>
              
              
                
                   Members ({members.length})
                
                
                  {members.slice(0, 5).map((member) => (
                    
                      {member.user.username}
                      {member.role}
                    
                  ))}
                  {members.length > 5 && (
                     onViewMembers(organization)}
                    >
                      View all {members.length} members
                    
                  )}
                
              
            
          )}
        
      
    
  );
}