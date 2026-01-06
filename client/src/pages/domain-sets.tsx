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
  const [selectedAccountsList, setSelectedAccountsList] = useState<DomainSet | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGroup, setFilterGroup] = useState<FilterGroup | undefined>(undefined);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const [listName, setListName] = useState("");

  const { data: accountsLists = [], isLoading } = useQuery<DomainSet[]>({
    queryKey: ['/api/domain-sets'],
  });

  const { data: items = [] } = useQuery<DomainSetItem[]>({
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
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const getMatchTypeBadge = (matchType?: string) => {
    if (!matchType) return <Badge variant="outline">pending</Badge>;
    const variants = {
      exact: 'default',
      fuzzy: 'secondary',
      none: 'outline',
    } as const;
    return <Badge variant={variants[matchType as keyof typeof variants]}>{matchType}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Accounts List (TAL)</h1>
          <p className="text-muted-foreground">
            Upload and match accounts by domain and/or company name for ABM campaigns
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-upload-domain-set">
              <Upload className="mr-2 h-4 w-4" />
              Upload Accounts List
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" data-testid="dialog-upload-domain-set">
            <DialogHeader>
              <DialogTitle>Upload Accounts List</DialogTitle>
              <DialogDescription>
                Upload a CSV file with domains and/or account names. Format: domain, account_name, notes (optional)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q4 2025 Target Accounts"
                  data-testid="input-domain-set-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enterprise accounts for outbound campaign"
                  data-testid="input-domain-set-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="csvContent">CSV Content</Label>
                <Textarea
                  id="csvContent"
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  placeholder="acme.com,Acme Corp,Enterprise prospect&#10;,Example Inc,Match by name only&#10;test.org,,Match by domain only"
                  rows={8}
                  data-testid="textarea-domain-set-csv"
                />
                <p className="text-sm text-muted-foreground">
                  Enter one row per line with domain and/or account name. Separate fields with commas. System will match by domain, name, or both.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={createMutation.isPending} data-testid="button-create-domain-set">
                {createMutation.isPending ? "Uploading..." : "Upload & Process"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search accounts lists..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-accounts-lists"
          />
        </div>
        <FilterBuilder
          entityType="account"
          onApplyFilter={setFilterGroup}
          initialFilter={filterGroup}
        />
      </div>

      {accountsLists.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No accounts lists yet</h3>
            <p className="text-muted-foreground mb-4">Upload your first accounts list to start matching</p>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Accounts List
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {accountsLists.map((accountsList) => (
            <Card key={accountsList.id} data-testid={`card-domain-set-${accountsList.id}`} className="cursor-pointer card-hover border-0 shadow-smooth-lg" onClick={() => setLocation(`/domain-sets/${accountsList.id}`)}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {accountsList.name}
                      {getStatusBadge(accountsList.status)}
                    </CardTitle>
                    {accountsList.description && (
                      <CardDescription>{accountsList.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConvertToList(accountsList);
                      }}
                      disabled={accountsList.status !== 'completed' || accountsList.matchedAccounts === 0}
                      data-testid={`button-convert-to-list-${accountsList.id}`}
                    >
                      <List className="mr-2 h-4 w-4" />
                      Convert to Contact List
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAccountsList(selectedAccountsList?.id === accountsList.id ? null : accountsList);
                      }}
                      data-testid={`button-view-details-${accountsList.id}`}
                    >
                      {selectedAccountsList?.id === accountsList.id ? "Hide Details" : "View Details"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(accountsList.id);
                      }}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${accountsList.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent onClick={(e) => e.stopPropagation()}>
                <div className="grid grid-cols-5 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{accountsList.totalUploaded}</p>
                    <p className="text-sm text-muted-foreground">Total Uploaded</p>
                  </div>
                  <div 
                    className="text-center cursor-pointer hover-elevate rounded-lg p-2 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocation(`/domain-sets/${accountsList.id}?view=accounts`);
                    }}
                  >
                    <p className="text-2xl font-bold text-green-600 hover:text-green-700">{accountsList.matchedAccounts}</p>
                    <p className="text-sm text-muted-foreground">Click to view</p>
                  </div>
                  <div 
                    className="text-center cursor-pointer hover-elevate rounded-lg p-2 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocation(`/domain-sets/${accountsList.id}?view=contacts`);
                    }}
                  >
                    <p className="text-2xl font-bold text-blue-600 hover:text-blue-700">{accountsList.matchedContacts}</p>
                    <p className="text-sm text-muted-foreground">Click to view</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">{accountsList.unknownDomains}</p>
                    <p className="text-sm text-muted-foreground">Unknown</p>
                  </div>
                  <div className="text-center"></div>
                </div>

                {selectedAccountsList?.id === accountsList.id && items.length > 0 && (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Domain</TableHead>
                          <TableHead>Normalized</TableHead>
                          <TableHead>Match Type</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Contacts</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.slice(0, 10).map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono">
                              {item.domain}
                              {item.accountName && (
                                <span className="ml-2 font-sans text-sm text-muted-foreground">
                                  {item.accountName}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {item.normalizedDomain}
                            </TableCell>
                            <TableCell>{getMatchTypeBadge(item.matchType)}</TableCell>
                            <TableCell>
                              {item.matchConfidence ? `${(parseFloat(item.matchConfidence) * 100).toFixed(0)}%` : '-'}
                            </TableCell>
                            <TableCell>{item.matchedContactsCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {items.length > 10 && (
                      <p className="text-sm text-muted-foreground text-center py-2 border-t">
                        Showing 10 of {items.length} domains
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent data-testid="dialog-convert-to-list">
          <DialogHeader>
            <DialogTitle>Convert to Contact List</DialogTitle>
            <DialogDescription>
              Create a static contact list from this accounts list
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="listName">Contact List Name</Label>
              <Input
                id="listName"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                data-testid="input-list-name"
              />
            </div>
            {selectedAccountsList && (
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm">
                  This will create a contact list with <strong>{selectedAccountsList.matchedContacts} contacts</strong> from{' '}
                  <strong>{selectedAccountsList.matchedAccounts} matched accounts</strong>
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedAccountsList) {
                  convertMutation.mutate({ id: selectedAccountsList.id, listName });
                }
              }}
              disabled={!listName || convertMutation.isPending}
              data-testid="button-confirm-convert"
            >
              {convertMutation.isPending ? "Creating..." : "Create Contact List"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}