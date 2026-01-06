import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, CheckCircle2, XCircle, AlertCircle, Copy, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { DomainAuth } from "@shared/schema";

export function DomainAuthDialog() {
  const { toast } = useToast();
  const [newDomain, setNewDomain] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const { data: domains = [], isLoading, error } = useQuery<DomainAuth[]>({
    queryKey: ["/api/domain-auth"],
  });

  console.log("DomainAuthDialog: domains", domains);
  console.log("DomainAuthDialog: error", error);
  console.log("DomainAuthDialog: isLoading", isLoading);

  const createMutation = useMutation({
    mutationFn: async (domain: string) => {
      return await apiRequest("POST", "/api/domain-auth", { domain });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/domain-auth"] });
      setNewDomain("");
      setIsAdding(false);
      toast({
        title: "Domain added",
        description: "Please configure your DNS records.",
      });
    },
    onError: (error: Error) => {
      // Parse error message
      let message = "Failed to add domain.";
      try {
        const parts = error.message.split(': ');
        if (parts.length > 1) {
           const jsonStr = parts.slice(1).join(': ');
           const data = JSON.parse(jsonStr);
           if (data.message) message = data.message;
        }
      } catch (e) {
        // ignore
      }
      
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/domain-auth/${id}/verify`);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/domain-auth"] });
      toast({
        title: "Verification completed",
        description: `SPF: ${data.spfStatus}, DKIM: ${data.dkimStatus}`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Verification failed.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      console.log("[Domain Delete] Deleting domain with id:", id);
      return await apiRequest("DELETE", `/api/domain-auth/${id}`);
    },
    onSuccess: async () => {
      console.log("[Domain Delete] Success, refetching domains");
      await queryClient.invalidateQueries({ queryKey: ["/api/domain-auth"], refetchType: 'active' });
      await queryClient.refetchQueries({ queryKey: ["/api/domain-auth"] });
      toast({
        title: "Domain deleted",
        description: "The domain has been removed.",
      });
    },
    onError: (error) => {
      console.error("[Domain Delete] Error:", error);
      toast({
        title: "Error",
        description: "Failed to delete domain.",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      verified: "default",
      pending: "secondary",
      failed: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Manage Domains</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Domain Authentication</DialogTitle>
          <DialogDescription>
            Manage your sender domains and verify DNS records (SPF, DKIM, DMARC).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-end gap-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="domain">Add New Domain</Label>
              <Input 
                type="text" 
                id="domain" 
                placeholder="example.com" 
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
              />
            </div>
            <Button onClick={() => createMutation.mutate(newDomain)} disabled={!newDomain || createMutation.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              Add Domain
            </Button>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>SPF</TableHead>
                  <TableHead>DKIM</TableHead>
                  <TableHead>DMARC</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No domains added yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  domains.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell className="font-medium">{domain.domain}</TableCell>
                      <TableCell>{getStatusBadge(domain.spfStatus)}</TableCell>
                      <TableCell>{getStatusBadge(domain.dkimStatus)}</TableCell>
                      <TableCell>{getStatusBadge(domain.dmarcStatus)}</TableCell>
                      <TableCell className="space-x-2">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => verifyMutation.mutate(domain.id)}
                          disabled={verifyMutation.isPending}
                        >
                          <RefreshCw className={`h-4 w-4 mr-2 ${verifyMutation.isPending ? 'animate-spin' : ''}`} />
                          Verify
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(domain.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="bg-muted p-4 rounded-md text-sm space-y-2">
            <h4 className="font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              DNS Configuration Instructions (Mailgun)
            </h4>
            <p>To verify your domain with Mailgun, add the following records to your DNS provider:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><strong>SPF (TXT):</strong> v=spf1 include:mailgun.org ~all</li>
              <li><strong>MX:</strong> mxa.mailgun.org (10), mxb.mailgun.org (10)</li>
              <li><strong>DKIM (TXT):</strong> Check Mailgun dashboard for selector (e.g., <code>pic._domainkey</code>)</li>
              <li><strong>DMARC (TXT):</strong> v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
