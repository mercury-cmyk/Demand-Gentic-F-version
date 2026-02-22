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
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function JsonSection({ label, data }: { label: string; data: any }) {
  if (!data || Object.keys(data).length === 0) return null;

  const entries = Object.entries(data).filter(
    ([, v]: [string, any]) => v && (typeof v === 'string' ? v.trim() : v.value)
  );

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{label}</h4>
      <div className="space-y-2 pl-2">
        {entries.map(([key, val]: [string, any]) => (
          <div key={key} className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground capitalize">
              {key.replace(/([A-Z])/g, ' $1').trim()}
            </p>
            <p className="text-sm text-foreground/80">
              {typeof val === 'string' ? val : val?.value || JSON.stringify(val)}
            </p>
          </div>
        ))}
      </div>
    </div>
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
      return res.json() as Promise<{ members: OrganizationMember[] }>;
    },
    enabled: !!organization?.id && open,
  });

  if (!organization) return null;

  const typeConfig = TYPE_CONFIG[organization.organizationType] || TYPE_CONFIG.client;
  const TypeIcon = typeConfig.icon;
  const members = membersData?.members || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
            <SheetTitle className="text-lg">{organization.name}</SheetTitle>
          </div>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={typeConfig.badgeClass}>
              {typeConfig.label}
            </Badge>
            {organization.isCampaignOrg && organization.organizationType !== 'campaign' && (
              <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-300">
                Campaign
              </Badge>
            )}
            {organization.isActive ? (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
            ) : (
              <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">Inactive</Badge>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Actions */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onEdit(organization)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => onViewMembers(organization)}>
              <Users className="mr-2 h-4 w-4" /> Members ({organization.memberCount ?? members.length})
            </Button>
          </div>

          <Separator />

          {/* Basic Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" /> Basic Information
            </h3>
            <DetailRow label="Domain" value={organization.domain} />
            <DetailRow label="Industry" value={organization.industry} />
            <DetailRow label="Description" value={organization.description} />
            <DetailRow
              label="Created"
              value={organization.createdAt ? new Date(organization.createdAt).toLocaleDateString() : undefined}
            />
          </div>

          {/* Intelligence Sections */}
          {(organization.identity || organization.offerings || organization.icp || organization.positioning) && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Briefcase className="h-4 w-4" /> Organization Intelligence
                </h3>
                <JsonSection label="Identity" data={organization.identity} />
                <JsonSection label="Offerings" data={organization.offerings} />
                <JsonSection label="ICP" data={organization.icp} />
                <JsonSection label="Positioning" data={organization.positioning} />
              </div>
            </>
          )}

          {/* Members Preview */}
          {members.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" /> Members ({members.length})
                </h3>
                <div className="space-y-2">
                  {members.slice(0, 5).map((member) => (
                    <div key={member.id} className="flex items-center justify-between text-sm">
                      <span>{member.user.username}</span>
                      <Badge variant="outline" className="text-xs capitalize">{member.role}</Badge>
                    </div>
                  ))}
                  {members.length > 5 && (
                    <Button
                      variant="link"
                      size="sm"
                      className="px-0 text-xs"
                      onClick={() => onViewMembers(organization)}
                    >
                      View all {members.length} members
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
