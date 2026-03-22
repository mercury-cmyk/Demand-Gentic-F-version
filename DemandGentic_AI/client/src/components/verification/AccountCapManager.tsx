import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Search, RefreshCw, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AccountCapStatus {
  account_id: string;
  account_name: string;
  domain: string | null;
  cap: number;
  submitted_count: number;
  reserved_count: number;
  eligible_count: number;
  total_committed: number;
  slots_remaining: number;
  top_priority_score: string | null;
  cap_status: 'at_cap' | 'near_cap' | 'available';
  updated_at: string | null;
}

interface Contact {
  id: string;
  fullName: string;
  title: string | null;
  email: string | null;
  seniorityLevel: string | null;
  titleAlignmentScore: string | null;
  priorityScore: string | null;
  eligibilityStatus: string;
  reservedSlot: boolean;
}

export function AccountCapManager({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [adjustCapDialogOpen, setAdjustCapDialogOpen] = useState(false);
  const [newCap, setNewCap] = useState(10);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Fetch account cap statuses
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/verification-campaigns', campaignId, 'account-caps', { page, search, limit }],
  });

  // Fetch contacts for selected account
  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['/api/verification-campaigns', campaignId, 'account-caps', selectedAccount?.account_id, 'contacts'],
    enabled: !!selectedAccount,
  });

  // Adjust cap mutation
  const adjustCapMutation = useMutation({
    mutationFn: async ({ accountId, cap }: { accountId: string; cap: number }) => {
      return await apiRequest(
        `/api/verification-campaigns/${campaignId}/account-caps/${accountId}`,
        'PATCH',
        { cap }
      );
    },
    onSuccess: () => {
      toast({ title: "Cap updated successfully" });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/verification-campaigns', campaignId, 'account-caps'] 
      });
      setAdjustCapDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update cap", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Recalculate all caps mutation
  const recalculateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        `/api/verification-campaigns/${campaignId}/account-caps/recalculate`,
        'POST'
      );
    },
    onSuccess: () => {
      toast({ title: "Cap statuses recalculated successfully" });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/verification-campaigns', campaignId, 'account-caps'] 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to recalculate caps", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const getCapStatusBadge = (status: string) => {
    switch (status) {
      case 'at_cap':
        return At Cap;
      case 'near_cap':
        return Near Cap;
      default:
        return Available;
    }
  };

  return (
    
      
        
          
            
              Account Cap Manager
              
                Monitor and manage per-company lead submission caps
              
            
            
               recalculateMutation.mutate()}
                disabled={recalculateMutation.isPending}
                data-testid="button-recalculate-caps"
              >
                {recalculateMutation.isPending ? (
                  
                ) : (
                  
                )}
                Recalculate All
              
            
          
        
        
          {/* Search bar */}
          
            
              
               {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
                data-testid="input-search-companies"
              />
            
          

          {/* Account cap status table */}
          {isLoading ? (
            
              
            
          ) : data?.data.length === 0 ? (
            
              No accounts found
            
          ) : (
            <>
              
                
                  
                    Company
                    Cap
                    Submitted
                    Reserved
                    Eligible
                    Remaining
                    Status
                    Actions
                  
                
                
                  {data?.data.map((account) => (
                    
                      
                        
                          {account.account_name}
                          {account.domain && (
                            
                              {account.domain}
                            
                          )}
                        
                      
                      
                        {account.cap}
                      
                      
                        {account.submitted_count}
                      
                      
                        {account.reserved_count}
                      
                      
                        {account.eligible_count}
                      
                      
                        
                          {account.slots_remaining}
                        
                      
                      
                        {getCapStatusBadge(account.cap_status)}
                      
                      
                        
                           setSelectedAccount(account)}
                            data-testid={`button-view-contacts-${account.account_id}`}
                          >
                            View Contacts
                          
                           {
                              setSelectedAccount(account);
                              setNewCap(account.cap);
                              setAdjustCapDialogOpen(true);
                            }}
                            data-testid={`button-adjust-cap-${account.account_id}`}
                          >
                            
                          
                        
                      
                    
                  ))}
                
              

              {/* Pagination */}
              {data && data.pages > 1 && (
                
                  
                    Page {page} of {data.pages}
                  
                  
                     setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      data-testid="button-prev-page"
                    >
                      Previous
                    
                     setPage(p => Math.min(data.pages, p + 1))}
                      disabled={page === data.pages}
                      data-testid="button-next-page"
                    >
                      Next
                    
                  
                
              )}
            
          )}
        
      

      {/* Adjust cap dialog */}
      
        
          
            Adjust Cap for {selectedAccount?.account_name}
            
              Set a custom lead cap for this account. This overrides the campaign default.
            
          
          
            New Cap
             setNewCap(Number(e.target.value))}
              data-testid="input-new-cap"
            />
          
          
             setAdjustCapDialogOpen(false)}
              data-testid="button-cancel-adjust"
            >
              Cancel
            
             {
                if (selectedAccount) {
                  adjustCapMutation.mutate({ 
                    accountId: selectedAccount.account_id, 
                    cap: newCap 
                  });
                }
              }}
              disabled={adjustCapMutation.isPending}
              data-testid="button-save-cap"
            >
              {adjustCapMutation.isPending ? (
                
              ) : (
                "Save"
              )}
            
          
        
      

      {/* View contacts dialog */}
       !open && setSelectedAccount(null)}>
        
          
            
              Top Priority Contacts - {selectedAccount?.account_name}
            
            
              Contacts ordered by priority score (seniority + title alignment)
            
          
          
            {contactsLoading ? (
              
                
              
            ) : contactsData?.data.length === 0 ? (
              
                No contacts found
              
            ) : (
              
                
                  
                    Name
                    Title
                    Seniority
                    Priority
                    Status
                  
                
                
                  {contactsData?.data.map((contact) => (
                    
                      
                        
                          {contact.fullName}
                          {contact.email && (
                            
                              {contact.email}
                            
                          )}
                        
                      
                      
                        {contact.title || '-'}
                      
                      
                        
                          {contact.seniorityLevel || 'unknown'}
                        
                      
                      
                        {contact.priorityScore ? Number(contact.priorityScore).toFixed(3) : '-'}
                      
                      
                        
                          {contact.eligibilityStatus}
                        
                      
                    
                  ))}
                
              
            )}
          
        
      
    
  );
}