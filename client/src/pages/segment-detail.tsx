
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Users, ListFilter, Building2, User } from "lucide-react";
import type { Segment, Contact, Account } from "@shared/schema";

export default function SegmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const { data: segment, isLoading: segmentLoading } = useQuery<Segment>({
    queryKey: [`/api/segments/${id}`],
  });

  const { data: members, isLoading: membersLoading } = useQuery<(Contact | Account)[]>({
    queryKey: [`/api/segments/${id}/members`],
    enabled: !!id,
  });

  if (segmentLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!segment) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Segment not found</p>
        <Button variant="outline" onClick={() => setLocation('/segments')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Segments
        </Button>
      </div>
    );
  }

  const isContactSegment = segment.entityType === 'contact';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocation('/segments')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{segment.name}</h1>
            <p className="text-muted-foreground mt-1">{segment.description || "No description"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{segment.entityType}</Badge>
          <Badge variant="outline">{segment.visibilityScope}</Badge>
          {segment.isActive && <Badge className="bg-green-500/10 text-green-500">Active</Badge>}
        </div>
      </div>

      {/* Filter Info */}
      {segment.definitionJson && (segment.definitionJson as any).conditions?.length > 0 && (
        <div className="flex items-center gap-2 p-4 border rounded-lg bg-muted/50">
          <ListFilter className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm">
            {(segment.definitionJson as any).conditions.length} filter condition(s) - 
            Logic: {(segment.definitionJson as any).logic || 'AND'}
          </span>
        </div>
      )}

      {/* Members Table */}
      <div className="border rounded-lg">
        <div className="p-4 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <h2 className="text-lg font-semibold">
              {isContactSegment ? 'Contacts' : 'Accounts'} ({members?.length || 0})
            </h2>
          </div>
        </div>

        {membersLoading ? (
          <div className="p-8">
            <Skeleton className="h-64 w-full" />
          </div>
        ) : members && members.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                {isContactSegment ? (
                  <>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Company</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Size</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member: any) => {
                if (isContactSegment) {
                  const contact = member as Contact;
                  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                  const initials = `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.toUpperCase();
                  
                  return (
                    <TableRow
                      key={contact.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => setLocation(`/contacts/${contact.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{fullName || "No name"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{contact.email}</TableCell>
                      <TableCell>{contact.jobTitle || "-"}</TableCell>
                      <TableCell>
                        {(contact as any).account?.name || contact.accountId || "-"}
                      </TableCell>
                    </TableRow>
                  );
                } else {
                  const account = member as Account;
                  const initials = account.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                  
                  return (
                    <TableRow
                      key={account.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => setLocation(`/accounts/${account.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{account.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{account.domain || "-"}</TableCell>
                      <TableCell>{account.industryStandardized || "-"}</TableCell>
                      <TableCell>{account.employeesSizeRange || "-"}</TableCell>
                    </TableRow>
                  );
                }
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="p-12 text-center">
            {isContactSegment ? <User className="h-12 w-12 mx-auto text-muted-foreground mb-3" /> : <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />}
            <p className="text-muted-foreground">No {isContactSegment ? 'contacts' : 'accounts'} match this segment</p>
          </div>
        )}
      </div>
    </div>
  );
}
