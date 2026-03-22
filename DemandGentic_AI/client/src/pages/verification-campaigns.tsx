import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Settings, Upload, BarChart3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function VerificationCampaignsPage() {
  const [deletingCampaignId, setDeletingCampaignId] = useState(null);
  const { toast } = useToast();
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["/api/verification-campaigns"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await apiRequest("DELETE", `/api/verification-campaigns/${campaignId}`);
      if (!response.ok) {
        throw new Error("Failed to delete campaign");
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns"] });
      setDeletingCampaignId(null);
      toast({
        title: "Success",
        description: "Campaign deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete campaign",
        variant: "destructive",
      });
    },
  });

  return (
    
      
        
          
            Verification Campaigns
          
          
            Configure and manage data verification campaigns with customizable eligibility rules
          
        
        
          
            
            New Campaign
          
        
      

      
        
          All Campaigns
        
        
          {isLoading ? (
            
              Loading campaigns...
            
          ) : campaigns && (campaigns as any[]).length > 0 ? (
            
              
                
                  Campaign Name
                  Monthly Target
                  Lead Cap/Account
                  Status
                  Actions
                
              
              
                {(campaigns as any[]).map((campaign: any) => (
                  
                    
                      {campaign.name}
                    
                    
                      {campaign.monthlyTarget}
                    
                    
                      {campaign.leadCapPerAccount}
                    
                    
                      
                        {campaign.status}
                      
                    
                    
                      
                        
                          
                            
                            Upload
                          
                        
                        
                          
                            
                            Stats
                          
                        
                        
                          
                            Console
                          
                        
                        
                          
                            
                          
                        
                         setDeletingCampaignId(campaign.id)}
                          disabled={deleteMutation.isPending}
                        >
                          
                        
                      
                    
                  
                ))}
              
            
          ) : (
            
              No campaigns found. Create one to get started.
            
          )}
        
      

       !open && setDeletingCampaignId(null)}>
        
          
            Delete Campaign
            
              Are you sure you want to delete this campaign? This action cannot be undone and will remove all associated data.
            
          
          
            Cancel
             {
                if (deletingCampaignId) {
                  deleteMutation.mutate(deletingCampaignId);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            
          
        
      
    
  );
}