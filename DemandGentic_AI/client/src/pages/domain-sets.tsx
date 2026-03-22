import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { Plus, Upload, Trash2, List, RefreshCw, Search } from "lucide-react";
import { FilterBuilder } from "@/components/filter-builder";
import type { FilterGroup } from "@shared/filter-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface DomainSet {
  id: string;
  name: string;
  description?: string;
  totalUploaded: number;
  matchedAccounts: number;
  matchedContacts: number;
  duplicatesRemoved: number;
  unknownDomains: number;
  status: 'processing' | 'completed' | 'error';
  createdAt: string;
  domains: string[]; // Added for filter construction
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

export default function AccountsListTAL() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedAccountsList, setSelectedAccountsList] = useState(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGroup, setFilterGroup] = useState(undefined);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const [listName, setListName] = useState("");

  const { data: accountsLists = [], isLoading } = useQuery({
    queryKey: ['/api/domain-sets'],
  });

  const { data: items = [] } = useQuery({
    queryKey: ['/api/domain-sets', selectedAccountsList?.id, 'items'],
    enabled: !!selectedAccountsList,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; csvContent: string }) => {
      const response = await apiRequest('POST', '/api/domain-sets', data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/domain-sets'] });
      setUploadDialogOpen(false);
      setName("");
      setDescription("");
      setCsvContent("");
      toast({
        title: "Accounts List created",
        description: "Processing matches in background...",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create accounts list",
        variant: "destructive",
      });
    },
  });

  const convertMutation = useMutation({
    mutationFn: async ({ id, listName }: { id: string; listName: string }) => {
      const response = await apiRequest('POST', `/api/domain-sets/${id}/convert-to-list`, { listName });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
      setConvertDialogOpen(false);
      setListName("");
      toast({
        title: "Contact List created",
        description: "Accounts list converted to contact list successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to convert to contact list",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/domain-sets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/domain-sets'] });
      setSelectedAccountsList(null);
      toast({
        title: "Accounts List deleted",
        description: "Accounts list has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete accounts list",
        variant: "destructive",
      });
    },
  });

  const handleUpload = () => {
    if (!name || !csvContent) {
      toast({
        title: "Validation Error",
        description: "Name and CSV content are required",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({ name, description, csvContent });
  };

  const handleConvertToList = (accountsList: DomainSet) => {
    setSelectedAccountsList(accountsList);
    setListName(`${accountsList.name} - Contact List`);
    setConvertDialogOpen(true);
  };

  const getStatusBadge = (status: DomainSet['status']) => {
    const variants = {
      processing: 'secondary',
      completed: 'default',
      error: 'destructive',
    } as const;
    return {status};
  };

  const getMatchTypeBadge = (matchType?: string) => {
    if (!matchType) return pending;
    const variants = {
      exact: 'default',
      fuzzy: 'secondary',
      none: 'outline',
    } as const;
    return {matchType};
  };

  if (isLoading) {
    return (
      
        
          
            
            
          
          
        
        
          {[1, 2, 3].map((i) => (
            
              
                
              
              
                
              
            
          ))}
        
      
    );
  }

  return (
    
      
        
          Accounts List (TAL)
          
            Upload and match accounts by domain and/or company name for ABM campaigns
          
        
        
          
          
            
              
              Upload Accounts List
            
          
          
            
              Upload Accounts List
              
                Upload a CSV file with domains and/or account names. Format: domain, account_name, notes (optional)
              
            
            
              
                Name
                 setName(e.target.value)}
                  placeholder="Q4 2025 Target Accounts"
                  data-testid="input-domain-set-name"
                />
              
              
                Description (optional)
                 setDescription(e.target.value)}
                  placeholder="Enterprise accounts for outbound campaign"
                  data-testid="input-domain-set-description"
                />
              
              
                CSV Content
                 setCsvContent(e.target.value)}
                  placeholder="acme.com,Acme Corp,Enterprise prospect&#10;,Example Inc,Match by name only&#10;test.org,,Match by domain only"
                  rows={8}
                  data-testid="textarea-domain-set-csv"
                />
                
                  Enter one row per line with domain and/or account name. Separate fields with commas. System will match by domain, name, or both.
                
              
            
            
               setUploadDialogOpen(false)}>
                Cancel
              
              
                {createMutation.isPending ? "Uploading..." : "Upload & Process"}
              
            
          
        
        
      

      
        
          
           setSearchQuery(e.target.value)}
            data-testid="input-search-accounts-lists"
          />
        
        
      

      {accountsLists.length === 0 ? (
        
          
            
            No accounts lists yet
            Upload your first accounts list to start matching
             setUploadDialogOpen(true)}>
              
              Upload Accounts List
            
          
        
      ) : (
        
          {accountsLists.map((accountsList) => (
             setLocation(`/domain-sets/${accountsList.id}`)}>
              
                
                  
                    
                      {accountsList.name}
                      {getStatusBadge(accountsList.status)}
                    
                    {accountsList.description && (
                      {accountsList.description}
                    )}
                  
                   e.stopPropagation()}>
                     {
                        e.stopPropagation();
                        handleConvertToList(accountsList);
                      }}
                      disabled={accountsList.status !== 'completed' || accountsList.matchedAccounts === 0}
                      data-testid={`button-convert-to-list-${accountsList.id}`}
                    >
                      
                      Convert to Contact List
                    
                     {
                        e.stopPropagation();
                        setSelectedAccountsList(selectedAccountsList?.id === accountsList.id ? null : accountsList);
                      }}
                      data-testid={`button-view-details-${accountsList.id}`}
                    >
                      {selectedAccountsList?.id === accountsList.id ? "Hide Details" : "View Details"}
                    
                     {
                        e.stopPropagation();
                        deleteMutation.mutate(accountsList.id);
                      }}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${accountsList.id}`}
                    >
                      
                    
                  
                
              
               e.stopPropagation()}>
                
                  
                    {accountsList.totalUploaded}
                    Total Uploaded
                  
                   {
                      e.stopPropagation();
                      setLocation(`/domain-sets/${accountsList.id}?view=accounts`);
                    }}
                  >
                    {accountsList.matchedAccounts}
                    Click to view
                  
                   {
                      e.stopPropagation();
                      setLocation(`/domain-sets/${accountsList.id}?view=contacts`);
                    }}
                  >
                    {accountsList.matchedContacts}
                    Click to view
                  
                  
                    {accountsList.unknownDomains}
                    Unknown
                  
                  
                

                {selectedAccountsList?.id === accountsList.id && items.length > 0 && (
                  
                    
                      
                        
                          Domain
                          Normalized
                          Match Type
                          Confidence
                          Contacts
                        
                      
                      
                        {items.slice(0, 10).map((item) => (
                          
                            
                              {item.domain}
                              {item.accountName && (
                                
                                  {item.accountName}
                                
                              )}
                            
                            
                              {item.normalizedDomain}
                            
                            {getMatchTypeBadge(item.matchType)}
                            
                              {item.matchConfidence ? `${(parseFloat(item.matchConfidence) * 100).toFixed(0)}%` : '-'}
                            
                            {item.matchedContactsCount}
                          
                        ))}
                      
                    
                    {items.length > 10 && (
                      
                        Showing 10 of {items.length} domains
                      
                    )}
                  
                )}
              
            
          ))}
        
      )}

      
        
          
            Convert to Contact List
            
              Create a static contact list from this accounts list
            
          
          
            
              Contact List Name
               setListName(e.target.value)}
                data-testid="input-list-name"
              />
            
            {selectedAccountsList && (
              
                
                  This will create a contact list with {selectedAccountsList.matchedContacts} contacts from{' '}
                  {selectedAccountsList.matchedAccounts} matched accounts
                
              
            )}
          
          
             setConvertDialogOpen(false)}>
              Cancel
            
             {
                if (selectedAccountsList) {
                  convertMutation.mutate({ id: selectedAccountsList.id, listName });
                }
              }}
              disabled={!listName || convertMutation.isPending}
              data-testid="button-confirm-convert"
            >
              {convertMutation.isPending ? "Creating..." : "Create Contact List"}
            
          
        
      
    
  );
}