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
  const [selectedAccount, setSelectedAccount] = useState<AccountCapStatus | null>(null);
  const [adjustCapDialogOpen, setAdjustCapDialogOpen] = useState(false);
  const [newCap, setNewCap] = useState<number>(10);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Fetch account cap statuses
  const { data, isLoading, refetch } = useQuery<{ 
    data: AccountCapStatus[];
    total: number;
    pages: number;
  }>({
    queryKey: ['/api/verification-campaigns', campaignId, 'account-caps', { page, search, limit }],
  });

  // Fetch contacts for selected account
  const { data: contactsData, isLoading: contactsLoading } = useQuery<{ data: Contact[] }>({
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
        return <Badge variant="destructive" data-testid={`badge-cap-status-at_cap`}>At Cap</Badge>;
      case 'near_cap':
        return <Badge variant="secondary" data-testid={`badge-cap-status-near_cap`}>Near Cap</Badge>;
      default:
        return <Badge variant="default" data-testid={`badge-cap-status-available`}>Available</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Account Cap Manager</CardTitle>
              <CardDescription>
                Monitor and manage per-company lead submission caps
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => recalculateMutation.mutate()}
                disabled={recalculateMutation.isPending}
                data-testid="button-recalculate-caps"
              >
                {recalculateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span className="ml-2">Recalculate All</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search bar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by company name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
                data-testid="input-search-companies"
              />
            </div>
          </div>

          {/* Account cap status table */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : data?.data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No accounts found
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Cap</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Reserved</TableHead>
                    <TableHead>Eligible</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.map((account) => (
                    <TableRow 
                      key={account.account_id}
                      data-testid={`row-account-${account.account_id}`}
                    >
                      <TableCell className="font-medium">
                        <div>
                          <div>{account.account_name}</div>
                          {account.domain && (
                            <div className="text-sm text-muted-foreground">
                              {account.domain}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-cap-${account.account_id}`}>
                        {account.cap}
                      </TableCell>
                      <TableCell data-testid={`text-submitted-${account.account_id}`}>
                        {account.submitted_count}
                      </TableCell>
                      <TableCell data-testid={`text-reserved-${account.account_id}`}>
                        {account.reserved_count}
                      </TableCell>
                      <TableCell data-testid={`text-eligible-${account.account_id}`}>
                        {account.eligible_count}
                      </TableCell>
                      <TableCell data-testid={`text-remaining-${account.account_id}`}>
                        <span className={account.slots_remaining <= 0 ? "text-destructive font-medium" : ""}>
                          {account.slots_remaining}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getCapStatusBadge(account.cap_status)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedAccount(account)}
                            data-testid={`button-view-contacts-${account.account_id}`}
                          >
                            View Contacts
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedAccount(account);
                              setNewCap(account.cap);
                              setAdjustCapDialogOpen(true);
                            }}
                            data-testid={`button-adjust-cap-${account.account_id}`}
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {data && data.pages > 1 && (
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {data.pages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      data-testid="button-prev-page"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(data.pages, p + 1))}
                      disabled={page === data.pages}
                      data-testid="button-next-page"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Adjust cap dialog */}
      <Dialog open={adjustCapDialogOpen} onOpenChange={setAdjustCapDialogOpen}>
        <DialogContent data-testid="dialog-adjust-cap">
          <DialogHeader>
            <DialogTitle>Adjust Cap for {selectedAccount?.account_name}</DialogTitle>
            <DialogDescription>
              Set a custom lead cap for this account. This overrides the campaign default.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="new-cap">New Cap</Label>
            <Input
              id="new-cap"
              type="number"
              min="0"
              value={newCap}
              onChange={(e) => setNewCap(Number(e.target.value))}
              data-testid="input-new-cap"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAdjustCapDialogOpen(false)}
              data-testid="button-cancel-adjust"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
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
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View contacts dialog */}
      <Dialog open={!!selectedAccount && !adjustCapDialogOpen} onOpenChange={(open) => !open && setSelectedAccount(null)}>
        <DialogContent className="max-w-4xl" data-testid="dialog-view-contacts">
          <DialogHeader>
            <DialogTitle>
              Top Priority Contacts - {selectedAccount?.account_name}
            </DialogTitle>
            <DialogDescription>
              Contacts ordered by priority score (seniority + title alignment)
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {contactsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : contactsData?.data.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No contacts found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Seniority</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contactsData?.data.map((contact) => (
                    <TableRow 
                      key={contact.id}
                      data-testid={`row-contact-${contact.id}`}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{contact.fullName}</div>
                          {contact.email && (
                            <div className="text-sm text-muted-foreground">
                              {contact.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {contact.title || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {contact.seniorityLevel || 'unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-priority-${contact.id}`}>
                        {contact.priorityScore ? Number(contact.priorityScore).toFixed(3) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={contact.eligibilityStatus === 'Eligible' ? 'default' : 'secondary'}
                        >
                          {contact.eligibilityStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
