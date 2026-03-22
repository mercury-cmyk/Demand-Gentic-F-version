/**
 * Proxy Form Submission Panel
 *
 * Embeddable panel that allows admins to:
 * 1. View email campaign clickers
 * 2. Select which clickers to proxy-submit through a landing page form
 * 3. Configure pacing and UTM parameters
 * 4. Monitor submission job progress
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Send,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  Ban,
} from "lucide-react";

interface ProxyFormSubmissionPanelProps {
  campaignId: string;
  pageSlug: string;
  campaignName?: string;
}

export default function ProxyFormSubmissionPanel({
  campaignId,
  pageSlug,
  campaignName,
}: ProxyFormSubmissionPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState>(new Set());
  const [utmSource, setUtmSource] = useState("email");
  const [utmMedium, setUtmMedium] = useState("proxy_submission");
  const [utmCampaign, setUtmCampaign] = useState(campaignName || "");
  const [minDelay, setMinDelay] = useState(3);
  const [maxDelay, setMaxDelay] = useState(15);

  // Fetch clickers
  const { data: clickersData, isLoading: clickersLoading } = useQuery;
    total: number;
  }>({
    queryKey: ["/api/generative-studio/proxy-submissions/campaign", campaignId, "clickers"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/generative-studio/proxy-submissions/campaign/${campaignId}/clickers`
      );
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Fetch existing jobs
  const { data: jobsData, isLoading: jobsLoading } = useQuery;
  }>({
    queryKey: ["/api/generative-studio/proxy-submissions/jobs", campaignId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/generative-studio/proxy-submissions/jobs?campaignId=${campaignId}`
      );
      return res.json();
    },
    enabled: !!campaignId,
    refetchInterval: 10000, // Auto-refresh every 10s to track progress
  });

  // Create job mutation
  const createJobMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/generative-studio/proxy-submissions/jobs", {
        pageSlug,
        campaignId,
        contactIds: Array.from(selectedIds),
        utmDefaults: {
          utmSource: utmSource || undefined,
          utmMedium: utmMedium || undefined,
          utmCampaign: utmCampaign || undefined,
        },
        minDelayMs: minDelay * 1000,
        maxDelayMs: maxDelay * 1000,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({
        queryKey: ["/api/generative-studio/proxy-submissions/jobs", campaignId],
      });
      toast({
        title: "Proxy submission job started",
        description: `${data.itemCount} contacts queued for form submission`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create submission job",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Cancel job mutation
  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/generative-studio/proxy-submissions/jobs/${jobId}/cancel`
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/generative-studio/proxy-submissions/jobs", campaignId],
      });
      toast({ title: "Job cancelled" });
    },
  });

  const clickers = clickersData?.clickers || [];
  const jobs = jobsData?.jobs || [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === clickers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clickers.map((c) => c.contactId)));
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return Completed;
      case "processing":
        return Processing;
      case "pending":
        return Pending;
      case "failed":
        return Failed;
      case "cancelled":
        return Cancelled;
      default:
        return {status};
    }
  };

  return (
    
      {/* Header */}
      
        
          
        
        
          Proxy Form Submissions
          
            Submit clickers through landing page form via USA IPs
          
        
      

      {/* Clickers list */}
      
        
          
            
            
              Email Clickers ({clickers.length})
            
          
          {clickers.length > 0 && (
            
              {selectedIds.size === clickers.length ? "Deselect All" : "Select All"}
            
          )}
        

        
          {clickersLoading ? (
            
              
              Loading clickers...
            
          ) : clickers.length === 0 ? (
            
              No email clickers found for this campaign.
              
                Clickers appear here after contacts click links in sent emails.
              
            
          ) : (
            clickers.map((c) => {
              const name = c.fullName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";
              return (
                
                   toggleSelect(c.contactId)}
                  />
                  
                    {name}
                    {c.email || "No email"}
                  
                  
                    {c.company || ""}
                    
                      Clicked {new Date(c.clickedAt).toLocaleDateString()}
                    
                  
                
              );
            })
          )}
        
      

      {/* UTM & Pacing config */}
      {selectedIds.size > 0 && (
        
          
            Submission Settings
          

          
            
              UTM Source
               setUtmSource(e.target.value)}
                placeholder="email"
                className="h-7 text-xs"
              />
            
            
              UTM Medium
               setUtmMedium(e.target.value)}
                placeholder="proxy_submission"
                className="h-7 text-xs"
              />
            
          

          
            UTM Campaign
             setUtmCampaign(e.target.value)}
              placeholder={campaignName || "campaign-name"}
              className="h-7 text-xs"
            />
          

          
            
              Min Delay (sec)
               setMinDelay(Number(e.target.value))}
                className="h-7 text-xs"
              />
            
            
              Max Delay (sec)
               setMaxDelay(Number(e.target.value))}
                className="h-7 text-xs"
              />
            
          

           createJobMutation.mutate()}
            disabled={createJobMutation.isPending || selectedIds.size === 0}
            className="w-full h-8 text-xs"
          >
            {createJobMutation.isPending ? (
              <>Creating job...
            ) : (
              <>Submit {selectedIds.size} Contacts via Proxy
            )}
          
        
      )}

      {/* Job history */}
      {jobs.length > 0 && (
        
          
            Submission Jobs
            
                queryClient.invalidateQueries({
                  queryKey: ["/api/generative-studio/proxy-submissions/jobs", campaignId],
                })
              }
            >
              
            
          

          
            {jobs.map((job) => (
              
                
                  
                    {statusBadge(job.status)}
                    
                      {job.completedItems}/{job.totalItems} done
                      {job.failedItems > 0 && `, ${job.failedItems} failed`}
                    
                  
                  
                    {new Date(job.createdAt).toLocaleString()}
                  
                
                {(job.status === "pending" || job.status === "processing") && (
                   cancelJobMutation.mutate(job.id)}
                    disabled={cancelJobMutation.isPending}
                  >
                    Cancel
                  
                )}
              
            ))}
          
        
      )}
    
  );
}