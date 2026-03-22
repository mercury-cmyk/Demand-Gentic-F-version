import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Building2, Users, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useSelection } from "@/hooks/use-selection";
import { AddToListDialog } from "@/components/add-to-list-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface DomainSet {
  id: string;
  name: string;
  description?: string;
  totalUploaded: number;
  matchedAccounts: number;
  matchedContacts: number;
  status: 'processing' | 'completed' | 'error';
}

interface DomainSetItem {
  id: string;
  domain: string;
  normalizedDomain: string;
  accountId?: string;
  accountName?: string | null;
  matchType?: 'exact' | 'fuzzy' | 'none';
  matchConfidence?: string;
  matchedContactsCount: number;
}

interface Account {
  id: string;
  name: string;
  domain?: string;
  industryStandardized?: string;
  employeesSizeRange?: string;
  annualRevenue?: string;
}

interface Contact {
  id: string;
  fullName: string;
  email: string;
  directPhone?: string;
  jobTitle?: string;
  accountId?: string;
}

export default function AccountsListDetail() {
  const { id } = useParams();
  const [location, setLocation] = useLocation();
  const queryParams = new URLSearchParams(location.split('?')[1] || '');
  const viewFilter = queryParams.get('view');
  const { toast } = useToast();
  
  // Dialogs
  const [addAccountsToListDialogOpen, setAddAccountsToListDialogOpen] = useState(false);
  const [addContactsToListDialogOpen, setAddContactsToListDialogOpen] = useState(false);

  const { data: accountsList, isLoading: listLoading } = useQuery({
    queryKey: [`/api/domain-sets/${id}`],
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: [`/api/domain-sets/${id}/items`],
    enabled: !!id,
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: [`/api/domain-sets/${id}/accounts`],
    enabled: !!id && viewFilter !== 'contacts',
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: [`/api/domain-sets/${id}/contacts`],
    enabled: !!id && viewFilter !== 'accounts',
  });

  // Selection hooks
  const accountsSelection = useSelection(accounts);
  const contactsSelection = useSelection(contacts);

  // Add accounts to list mutation
  const addAccountsToListMutation = useMutation({
    mutationFn: async (listId: string) => {
      return await apiRequest('POST', `/api/lists/${listId}/accounts`, {
        accountIds: Array.from(accountsSelection.selectedIds)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
      toast({ title: "Success", description: `Added ${accountsSelection.selectedCount} accounts to list` });
      accountsSelection.clearSelection();
      setAddAccountsToListDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to add accounts to list", variant: "destructive" });
    },
  });

  // Add contacts to list mutation
  const addContactsToListMutation = useMutation({
    mutationFn: async (listId: string) => {
      return await apiRequest('POST', `/api/lists/${listId}/contacts`, {
        contactIds: Array.from(contactsSelection.selectedIds)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
      toast({ title: "Success", description: `Added ${contactsSelection.selectedCount} contacts to list` });
      contactsSelection.clearSelection();
      setAddContactsToListDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to add contacts to list", variant: "destructive" });
    },
  });

  // Create list mutations
  const createAccountListMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const list = await apiRequest('POST', '/api/lists', {
        name,
        description,
        entityType: 'account',
        sourceType: 'selection',
        recordIds: Array.from(accountsSelection.selectedIds),
      });
      return list.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
      accountsSelection.clearSelection();
      setAddAccountsToListDialogOpen(false);
      toast({
        title: "Success",
        description: `Created list and added ${accountsSelection.selectedCount} accounts`,
      });
    },
  });

  const createContactListMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const list = await apiRequest('POST', '/api/lists', {
        name,
        description,
        entityType: 'contact',
        sourceType: 'selection',
        recordIds: Array.from(contactsSelection.selectedIds),
      });
      return list.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
      contactsSelection.clearSelection();
      setAddContactsToListDialogOpen(false);
      toast({
        title: "Success",
        description: `Created list and added ${contactsSelection.selectedCount} contacts`,
      });
    },
  });

  const getMatchTypeBadge = (matchType?: string) => {
    if (!matchType) return pending;
    const variants = {
      exact: 'default',
      fuzzy: 'secondary',
      none: 'outline',
    } as const;
    return {matchType};
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      processing: 'secondary',
      completed: 'default',
      error: 'destructive',
    } as const;
    return variants[status as keyof typeof variants] || 'outline';
  };

  const handleCardClick = (accountId: string, matchType: string | undefined) => {
    if (viewFilter === 'contacts') {
      // If viewing contacts, go to contact detail
      setLocation(`/contacts/${accountId}`);
    } else {
      // Otherwise go to account detail
      setLocation(`/accounts/${accountId}`);
    }
  };

  const handleNumberClick = (filterType: 'accounts' | 'contacts') => {
    setLocation(`/domain-sets/${id}?view=${filterType}`);
  };

  if (listLoading) {
    return (
      
        
        
      
    );
  }

  if (!accountsList) {
    return (
      
        Accounts list not found
         setLocation('/domain-sets')} className="mt-4">
          
          Back to Accounts Lists
        
      
    );
  }

  return (
    
      
        
          
             setLocation('/domain-sets')}
            >
              
            
            
              {accountsList.name}
              
                {viewFilter === 'accounts' && "Showing matched accounts only"}
                {viewFilter === 'contacts' && "Showing matched contacts only"}
                {!viewFilter && (accountsList.description || "Domain matching results")}
              
            
          
          
            {viewFilter && (
               setLocation(`/domain-sets/${id}`)}
              >
                Clear Filter
              
            )}
            {accountsList.status}
          
        
      

      
        
          
            Total Uploaded
          
          
            {accountsList.totalUploaded}
          
        
        
          
            Matched Accounts
          
          
             handleNumberClick('accounts')}>
              {accountsList.matchedAccounts}
            
          
        
        
          
            Matched Contacts
          
          
             handleNumberClick('contacts')}>
              {accountsList.matchedContacts}
            
          
        
        
          
            Unknown
          
          
            {accountsList.matchedAccounts ? accountsList.totalUploaded - accountsList.matchedAccounts : accountsList.totalUploaded}
          
        
      

      {(viewFilter === 'accounts' || !viewFilter) && (
        
          
            
              
                Matched Accounts
                Accounts that were successfully matched from this list
              
              {accountsSelection.selectedCount > 0 && (
                 setAddAccountsToListDialogOpen(true)}
                  size="sm"
                  data-testid="button-add-accounts-to-list"
                >
                  
                  Add {accountsSelection.selectedCount} to List
                
              )}
            
          
          
            {accountsLoading ? (
              
                {[1, 2, 3].map(i => (
                  
                ))}
              
            ) : accounts.length > 0 ? (
              
                
                  
                    
                      
                         accountsSelection.isAllSelected ? accountsSelection.clearSelection() : accountsSelection.selectAll()}
                          aria-label="Select all"
                          data-testid="checkbox-select-all-accounts"
                        />
                      
                      Account Name
                      Domain
                      Industry
                      Employees
                      Revenue
                      Actions
                    
                  
                  
                    {accounts.map((account) => (
                       handleCardClick(account.id, 'exact')}
                        data-testid={`row-account-${account.id}`}
                      >
                         e.stopPropagation()}>
                           accountsSelection.selectItem(account.id)}
                            aria-label={`Select ${account.name}`}
                            data-testid={`checkbox-account-${account.id}`}
                          />
                        
                        
                          
                            
                              
                            
                            {account.name}
                          
                        
                        {account.domain || "-"}
                        
                          {account.industryStandardized ? (
                            {account.industryStandardized}
                          ) : "-"}
                        
                        {account.employeesSizeRange || "-"}
                        {account.annualRevenue || "-"}
                        
                           {
                              e.stopPropagation();
                              handleCardClick(account.id, 'exact');
                            }}
                          >
                            View
                          
                        
                      
                    ))}
                  
                
              
            ) : (
              
                
                No matched accounts found
              
            )}
          
        
      )}

      {(viewFilter === 'contacts' || !viewFilter) && (
        
          
            
              
                Matched Contacts ({contacts.length})
                Contacts from accounts matched by this list
              
              {contactsSelection.selectedCount > 0 && (
                 setAddContactsToListDialogOpen(true)}
                  size="sm"
                  data-testid="button-add-contacts-to-list"
                >
                  
                  Add {contactsSelection.selectedCount} to List
                
              )}
            
          
          
            {contactsLoading ? (
              
                {[1, 2, 3].map(i => (
                  
                ))}
              
            ) : contacts.length > 0 ? (
              
                
                  
                    
                      
                         contactsSelection.isAllSelected ? contactsSelection.clearSelection() : contactsSelection.selectAll()}
                          aria-label="Select all"
                          data-testid="checkbox-select-all-contacts"
                        />
                      
                      Contact Name
                      Email
                      Phone
                      Job Title
                      Actions
                    
                  
                  
                    {contacts.map((contact) => (
                       handleCardClick(contact.id, 'exact')}
                        data-testid={`row-contact-${contact.id}`}
                      >
                         e.stopPropagation()}>
                           contactsSelection.selectItem(contact.id)}
                            aria-label={`Select ${contact.fullName}`}
                            data-testid={`checkbox-contact-${contact.id}`}
                          />
                        
                        
                          
                            
                              
                            
                            {contact.fullName}
                          
                        
                        {contact.email || "-"}
                        {contact.directPhone || "-"}
                        {contact.jobTitle || "-"}
                        
                           {
                              e.stopPropagation();
                              handleCardClick(contact.id, 'exact');
                            }}
                          >
                            View
                          
                        
                      
                    ))}
                  
                
              
            ) : (
              
                
                No matched contacts found
              
            )}
          
        
      )}

      {!viewFilter && (
        
          
            Domain Items ({items.length})
            All domains uploaded in this list with their match status
          
          
            {itemsLoading ? (
              
                {[1, 2, 3].map(i => (
                  
                ))}
              
            ) : items.length > 0 ? (
              
                
                  
                    
                      Domain
                      Match Type
                      Matched Account
                      Actions
                    
                  
                  
                    {items.map((item) => (
                      
                        {item.domain}
                        {getMatchTypeBadge(item.matchType)}
                        
                          {item.accountId && item.accountName ? (
                             setLocation(`/accounts/${item.accountId}`)}
                            >
                              {item.accountName}
                            
                          ) : (
                            -
                          )}
                        
                        
                          {item.accountId && (
                             setLocation(`/accounts/${item.accountId}`)}
                            >
                              View
                            
                          )}
                        
                      
                    ))}
                  
                
              
            ) : (
              
                No domain items found
              
            )}
          
        
      )}

      
        
          Match Details
          Detailed matching results for each domain
        
        
          
            
              
                
                  Domain
                  Normalized
                  Match Type
                  Confidence
                  Contacts
                
              
              
                {items.map((item) => (
                  
                    
                      {item.domain || '-'}
                      {item.accountName && (
                        
                          {item.accountName}
                        
                      )}
                    
                    
                      {item.normalizedDomain || '-'}
                    
                    {getMatchTypeBadge(item.matchType)}
                    
                      {item.matchConfidence ? `${(parseFloat(item.matchConfidence) * 100).toFixed(0)}%` : '-'}
                    
                    {item.matchedContactsCount}
                  
                ))}
              
            
          
        
      

      {/* Add Accounts to List Dialog */}
       addAccountsToListMutation.mutate(listId)}
        onCreateList={(name, description) => createAccountListMutation.mutate({ name, description })}
      />

      {/* Add Contacts to List Dialog */}
       addContactsToListMutation.mutate(listId)}
        onCreateList={(name, description) => createContactListMutation.mutate({ name, description })}
      />
    
  );
}