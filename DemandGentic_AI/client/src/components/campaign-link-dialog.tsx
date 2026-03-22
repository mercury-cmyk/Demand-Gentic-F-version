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

  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery({
    queryKey: ['/api/campaigns'],
    enabled: open,
  });

  const { data: links = [], isLoading: loadingLinks } = useQuery({
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
    
      
        
          Link Campaigns to {orderNumber}
          
            Manually link existing campaigns to this order for performance tracking
          
        

        
          {/* Linked Campaigns */}
          {linkedCampaigns.length > 0 && (
            
              Linked Campaigns ({linkedCampaigns.length})
              
                
                  
                    
                      Campaign Name
                      Type
                      Status
                      Actions
                    
                  
                  
                    {linkedCampaigns.map((campaign) => {
                      const link = links.find(l => l.campaignId === campaign.id);
                      return (
                        
                          
                            {campaign.name}
                          
                          
                            {campaign.type}
                          
                          
                            {campaign.status}
                          
                          
                             link && unlinkMutation.mutate(link.id)}
                              disabled={unlinkMutation.isPending}
                              data-testid={`button-unlink-${campaign.id}`}
                            >
                              
                            
                          
                        
                      );
                    })}
                  
                
              
            
          )}

          {/* Available Campaigns */}
          
            Available Campaigns
            
              
               setSearchQuery(e.target.value)}
                data-testid="input-search-campaigns"
              />
            

            {loadingCampaigns ? (
              
                
                  
                    
                      Campaign Name
                      Type
                      Status
                      Actions
                    
                  
                  
                    {[1, 2, 3].map((i) => (
                      
                        
                        
                        
                        
                      
                    ))}
                  
                
              
            ) : availableCampaigns.length === 0 ? (
              
                {searchQuery ? "No campaigns match your search" : "All campaigns are already linked"}
              
            ) : (
              
                
                  
                    
                      Campaign Name
                      Type
                      Status
                      Actions
                    
                  
                  
                    {availableCampaigns.map((campaign) => (
                      
                        
                          {campaign.name}
                        
                        
                          {campaign.type}
                        
                        
                          {campaign.status}
                        
                        
                           linkMutation.mutate(campaign.id)}
                            disabled={linkMutation.isPending}
                            data-testid={`button-link-${campaign.id}`}
                          >
                            {linkMutation.isPending ? (
                              
                            ) : (
                              
                            )}
                            Link
                          
                        
                      
                    ))}
                  
                
              
            )}
          
        

        
           onOpenChange(false)}
            data-testid="button-close-link-dialog"
          >
            Close
          
        
      
    
  );
}