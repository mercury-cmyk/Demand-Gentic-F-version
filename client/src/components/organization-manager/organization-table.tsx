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

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
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
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Domain</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Members</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                No organizations found
              </TableCell>
            </TableRow>
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
                <TableRow key={org.id} className={isSuper ? 'bg-amber-50/30' : undefined}>
                  <TableCell>
                    <button
                      onClick={() => onViewDetails(org)}
                      className="flex items-center gap-2 font-medium hover:underline text-left"
                    >
                      {isSuper && <Crown className="h-4 w-4 text-amber-500" />}
                      {org.name}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {badges.map((badge) => (
                        <Badge key={badge.label} variant="outline" className={badge.className}>
                          {badge.label}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {org.domain || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {org.industry || '-'}
                  </TableCell>
                  <TableCell>
                    {org.isActive ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {org.memberCount ?? 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {org.createdAt
                      ? new Date(org.createdAt).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onViewDetails(org)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEdit(org)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onViewMembers(org)}>
                          <Users className="mr-2 h-4 w-4" />
                          Members
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {isSuper ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="px-2 py-1.5 text-sm text-muted-foreground flex items-center gap-2 cursor-not-allowed">
                                  <Shield className="h-4 w-4" />
                                  Protected
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                Super organization cannot be deleted
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => onDelete(org)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
