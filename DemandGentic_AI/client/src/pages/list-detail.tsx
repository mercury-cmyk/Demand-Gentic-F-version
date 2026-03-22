import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useExportAuthority } from "@/hooks/use-export-authority";
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
import { ArrowLeft, Users, Building2, User, Download } from "lucide-react";
import type { List, Contact, Account } from "@shared/schema";

export default function ListDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { canExportData } = useExportAuthority();

  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: [`/api/lists/${id}`],
  });

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: [`/api/lists/${id}/members`],
    enabled: !!id,
  });

  if (listLoading) {
    return (
      
        
        
      
    );
  }

  if (!list) {
    return (
      
        List not found
         setLocation('/segments')} className="mt-4">
          
          Back to Lists
        
      
    );
  }

  const isContactList = list.entityType === 'contact';

  return (
    
      {/* Header */}
      
        
           setLocation('/segments')}
          >
            
          
          
            {list.name}
            {list.description || "No description"}
          
        
        
          {list.entityType}
          {list.sourceType}
          {canExportData && (
            
              
              Export CSV
            
          )}
        
      

      {/* List Info */}
      
        
          Created: 
          {new Date(list.createdAt).toLocaleDateString()}
        
        {list.snapshotTs && (
          
            Snapshot: 
            {new Date(list.snapshotTs).toLocaleDateString()}
          
        )}
        
          Records: 
          {list.recordIds?.length || 0}
        
      

      {/* Members Table */}
      
        
          
            
            
              {isContactList ? 'Contacts' : 'Accounts'} ({members?.length || 0})
            
          
        

        {membersLoading ? (
          
            
          
        ) : members && members.length > 0 ? (
          
            
              
                {isContactList ? (
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
                if (isContactList) {
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
          
            {isContactList ?  : }
            No {isContactList ? 'contacts' : 'accounts'} in this list
          
        )}
      
    
  );
}