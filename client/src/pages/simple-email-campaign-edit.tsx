/**
 * Simple Email Campaign Edit Page
 * 
 * Loads an existing campaign and allows editing via SimpleCampaignBuilder
 */

import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SimpleCampaignBuilder } from "@/components/simple-campaign";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function SimpleEmailCampaignEditPage() {
  const [, params] = useRoute("/campaigns/email/:id/edit");
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const campaignId = params?.id;

  const { data: campaign, isLoading, error } = useQuery({
    queryKey: ['/api/campaigns', campaignId],
    queryFn: async () => {
      const token = getToken();
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });
      if (!response.ok) throw new Error('Failed to load campaign');
      return response.json();
    },
    enabled: !!campaignId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-lg text-muted-foreground">Campaign not found</p>
        <button 
          onClick={() => setLocation('/campaigns/email')}
          className="text-primary hover:underline"
        >
          Back to campaigns
        </button>
      </div>
    );
  }

  return (
    <SimpleCampaignBuilder
      campaignId={campaignId}
      initialCampaign={campaign}
      organizationName="DemandGent.ai"
      organizationAddress="123 Innovation Way, San Francisco, CA 94105"
    />
  );
}
