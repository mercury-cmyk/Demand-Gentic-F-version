/**
 * Add Accounts to Pipeline Dialog
 *
 * Dialog for adding existing accounts to a pipeline's top-of-funnel.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Search, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  name: string;
  domain?: string;
  industryStandardized?: string;
  employeesSizeRange?: string;
  revenueRange?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  onAdded?: () => void;
}

export function AddAccountsToPipelineDialog({
  open,
  onOpenChange,
  pipelineId,
  onAdded,
}: Props) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch all accounts
  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/accounts");
      return response.json();
    },
    enabled: open,
  });

  // Filter accounts
  const filteredAccounts = accounts.filter((account) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      account.name?.toLowerCase().includes(query) ||
      account.domain?.toLowerCase().includes(query) ||
      account.industryStandardized?.toLowerCase().includes(query)
    );
  });

  // Toggle selection
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Select all visible
  const selectAll = () => {
    if (selectedIds.size === filteredAccounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAccounts.map((a) => a.id)));
    }
  };

  // Add accounts mutation
  const addMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/pipelines/${pipelineId}/accounts`, {
        accountIds: Array.from(selectedIds),
      });
    },
    onSuccess: async (response) => {
      const result = await response.json();
      toast({
        title: "Success",
        description: result.message || `Added ${result.added} accounts to pipeline`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "accounts"] });
      setSelectedIds(new Set());
      onOpenChange(false);
      onAdded?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add accounts",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Add Accounts to Pipeline
          </DialogTitle>
          <DialogDescription>
            Select accounts to add to this pipeline's top-of-funnel for outreach and qualification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search accounts by name, domain, or industry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Selection info */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between bg-primary/5 rounded-lg px-4 py-2">
              <span className="text-sm font-medium">
                {selectedIds.size} account(s) selected
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </Button>
            </div>
          )}

          {/* Accounts table */}
          <ScrollArea className="h-[400px] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={
                        selectedIds.size === filteredAccounts.length &&
                        filteredAccounts.length > 0
                      }
                      onCheckedChange={selectAll}
                    />
                  </TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      {searchQuery ? "No accounts match your search" : "No accounts available"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.slice(0, 100).map((account) => (
                    <TableRow
                      key={account.id}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50",
                        selectedIds.has(account.id) && "bg-primary/5"
                      )}
                      onClick={() => toggleSelect(account.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(account.id)}
                          onCheckedChange={() => toggleSelect(account.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{account.name}</p>
                            {account.domain && (
                              <p className="text-xs text-muted-foreground">{account.domain}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.industryStandardized ? (
                          <Badge variant="outline">{account.industryStandardized}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {account.employeesSizeRange || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {account.revenueRange || "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          {filteredAccounts.length > 100 && (
            <p className="text-xs text-muted-foreground text-center">
              Showing first 100 accounts. Use search to find specific accounts.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending || selectedIds.size === 0}
          >
            {addMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add {selectedIds.size} Account(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
