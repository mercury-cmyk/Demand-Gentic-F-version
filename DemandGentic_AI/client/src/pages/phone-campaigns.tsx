import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneCampaignPanel, type QueueStats } from "@/components/campaigns/phone-campaign-panel";
import { Campaign } from "@shared/schema";
import { EmptyState } from "@/components/shared/empty-state";
import { Phone } from "lucide-react";

export default function PhoneCampaignsPage() {
  const { getToken } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["/api/campaigns"],
    queryFn: async () => {
      const token = getToken();
      const response = await fetch(`/api/campaigns`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });
      if (!response.ok) throw new Error("Failed to fetch campaigns");
      return response.json();
    },
  });

  const PHONE_CAMPAIGN_TYPES = [
    'call', 'telemarketing', 'sql',
    'content_syndication', 'appointment_generation', 'appointment_setting',
    'high_quality_leads', 'lead_qualification', 'bant_qualification',
    'live_webinar', 'on_demand_webinar', 'executive_dinner',
    'leadership_forum', 'conference'
  ];

  const phoneCampaigns = campaigns.filter((c: any) =>
    (PHONE_CAMPAIGN_TYPES.includes(c.type) || c.dialMode === 'ai_agent') &&
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { data: queueStats = {} } = useQuery>({
    queryKey: ["/api/campaigns/queue-stats", phoneCampaigns.map((c: any) => c.id).join(',')],
    queryFn: async () => {
        const currentToken = getToken();
        if (!currentToken) return {};
        const stats: Record = {};
        await Promise.all(phoneCampaigns.map(async (campaign) => {
            try {
                const res = await fetch(`/api/campaigns/${campaign.id}/queue/stats`, {
                    headers: { 'Authorization': `Bearer ${currentToken}` }
                });
                if (res.ok) {
                    stats[campaign.id] = await res.json();
                }
            } catch (e) {
                // Network error - skip this campaign
            }
        }));
        return stats;
    },
    enabled: phoneCampaigns.length > 0 && !!getToken(),
    refetchInterval: 10000,
});


  if (isLoading) {
    return Loading...;
  }

  return (
    
      Phone Campaigns
      {phoneCampaigns.length === 0 ? (
        
      ) : (
        
          {phoneCampaigns.map((campaign) => (
            
              
                {campaign.name}
              
              
                
              
            
          ))}
        
      )}
    
  );
}