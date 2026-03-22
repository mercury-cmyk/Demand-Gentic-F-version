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
  const { id } = useParams();
  const [, setLocation] = useLocation();

  const { data: segment, isLoading: segmentLoading } = useQuery({
    queryKey: [`/api/segments/${id}`],
  });

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: [`/api/segments/${id}/members`],
    enabled: !!id,
  });

  if (segmentLoading) {
    return (
      
        
        
      
    );
  }

  if (!segment) {
    return (
      
        Segment not found
         setLocation('/segments')} className="mt-4">
          
          Back to Segments
        
      
    );
  }

  const isContactSegment = segment.entityType === 'contact';

  return (
    
      {/* Header */}
      
        
           setLocation('/segments')}
          >
            
          
          
            {segment.name}
            {segment.description || "No description"}
          
        
        
          {segment.entityType}
          {segment.visibilityScope}
          {segment.isActive && Active}
        
      

      {/* Filter Info */}
      {segment.definitionJson && (segment.definitionJson as any).conditions?.length > 0 && (
        
          
          
            {(segment.definitionJson as any).conditions.length} filter condition(s) - 
            Logic: {(segment.definitionJson as any).logic || 'AND'}
          
        
      )}

      {/* Members Table */}
      
        
          
            
            
              {isContactSegment ? 'Contacts' : 'Accounts'} ({members?.length || 0})
            
          
        

        {membersLoading ? (
          
            
          
        ) : members && members.length > 0 ? (
          
            
              
                {isContactSegment ? (
                  <>
                    Name
                    Email
                    Job Title
                    Company
                  
                ) : (
                  <>
                    Company Name
                    Domain
                    Industry
                    Size
                  
                )}
              
            
            
              {members.map((member: any) => {
                if (isContactSegment) {
                  const contact = member as Contact;
                  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                  const initials = `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.toUpperCase();
                  
                  return (
                     setLocation(`/contacts/${contact.id}`)}
                    >
                      
                        
                          
                            {initials}
                          
                          {fullName || "No name"}
                        
                      
                      {contact.email}
                      {contact.jobTitle || "-"}
                      
                        {(contact as any).account?.name || contact.accountId || "-"}
                      
                    
                  );
                } else {
                  const account = member as Account;
                  const initials = account.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                  
                  return (
                     setLocation(`/accounts/${account.id}`)}
                    >
                      
                        
                          
                            {initials}
                          
                          {account.name}
                        
                      
                      {account.domain || "-"}
                      {account.industryStandardized || "-"}
                      {account.employeesSizeRange || "-"}
                    
                  );
                }
              })}
            
          
        ) : (
          
            {isContactSegment ?  : }
            No {isContactSegment ? 'contacts' : 'accounts'} match this segment
          
        )}
      
    
  );
}