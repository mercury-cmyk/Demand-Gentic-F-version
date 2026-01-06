import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Link as LinkIcon, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { Campaign, OrderCampaignLink } from "@shared/schema";

interface CampaignLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
}

export function CampaignLinkDialog({ open, onOpenChange, orderId, orderNumber }: CampaignLinkDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    enabled: open,
  });

  const { data: links = [], isLoading: loadingLinks } = useQuery<OrderCampaignLink[]>({
    queryKey: ['/api/orders', orderId, 'campaign-links'],
    enabled: open,
  });

  const linkMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      const res = await apiRequest('POST', `/api/orders/${orderId}/campaign-links`, {
        campaignId,
        linkedById: user.id,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'campaign-links'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "Campaign linked successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to link campaign",
        variant: "destructive",
      });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await apiRequest('DELETE', `/api/orders/${orderId}/campaign-links/${linkId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'campaign-links'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "Campaign unlinked",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unlink campaign",
        variant: "destructive",
      });
    },
  });

  const linkedCampaignIds = new Set(links.map(l => l.campaignId));
  const availableCampaigns = campaigns.filter(c => 
    !linkedCampaignIds.has(c.id) &&
    (searchQuery ? c.name.toLowerCase().includes(searchQuery.toLowerCase()) : true)
  );
  const linkedCampaigns = campaigns.filter(c => linkedCampaignIds.has(c.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col" data-testid="dialog-campaign-link">
        <DialogHeader>
          <DialogTitle>Link Campaigns to {orderNumber}</DialogTitle>
          <DialogDescription>
            Manually link existing campaigns to this order for performance tracking
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-6">
          {/* Linked Campaigns */}
          {linkedCampaigns.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Linked Campaigns ({linkedCampaigns.length})</h3>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedCampaigns.map((campaign) => {
                      const link = links.find(l => l.campaignId === campaign.id);
                      return (
                        <TableRow key={campaign.id} data-testid={`row-linked-campaign-${campaign.id}`}>
                          <TableCell className="font-medium" data-testid={`text-campaign-name-${campaign.id}`}>
                            {campaign.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{campaign.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{campaign.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => link && unlinkMutation.mutate(link.id)}
                              disabled={unlinkMutation.isPending}
                              data-testid={`button-unlink-${campaign.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Available Campaigns */}
          <div>
            <h3 className="font-semibold mb-3">Available Campaigns</h3>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search campaigns..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-campaigns"
              />
            </div>

            {loadingCampaigns ? (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : availableCampaigns.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                {searchQuery ? "No campaigns match your search" : "All campaigns are already linked"}
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableCampaigns.map((campaign) => (
                      <TableRow key={campaign.id} data-testid={`row-available-campaign-${campaign.id}`}>
                        <TableCell className="font-medium">
                          {campaign.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{campaign.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{campaign.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => linkMutation.mutate(campaign.id)}
                            disabled={linkMutation.isPending}
                            data-testid={`button-link-${campaign.id}`}
                          >
                            {linkMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <LinkIcon className="mr-2 h-4 w-4" />
                            )}
                            Link
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-close-link-dialog"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
