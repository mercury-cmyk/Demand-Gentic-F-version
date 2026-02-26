
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneCampaignPanel, type QueueStats } from "@/components/campaigns/phone-campaign-panel";
import { Campaign } from "@shared/schema";
import { EmptyState } from "@/components/shared/empty-state";
import { Phone } from "lucide-react";

export default function PhoneCampaignsPage() {
  const { getToken, token } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
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
    'content_syndication', 'appointment_generation', 'high_quality_leads',
    'live_webinar', 'on_demand_webinar', 'executive_dinner',
    'leadership_forum', 'conference'
  ];

  const phoneCampaigns = campaigns.filter((c: any) =>
    (PHONE_CAMPAIGN_TYPES.includes(c.type) || c.dialMode === 'ai_agent') &&
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { data: queueStats = {} } = useQuery<Record<string, QueueStats>>({
    queryKey: ["/api/campaigns/queue-stats", phoneCampaigns.map((c: any) => c.id).join(',')],
    queryFn: async () => {
        const stats: Record<string, QueueStats> = {};
        for (const campaign of phoneCampaigns) {
            const res = await fetch(`/api/campaigns/${campaign.id}/queue/stats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                stats[campaign.id] = await res.json();
            }
        }
        return stats;
    },
    enabled: phoneCampaigns.length > 0 && !!token,
    refetchInterval: 10000,
});


  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">Phone Campaigns</h1>
      {phoneCampaigns.length === 0 ? (
        <EmptyState
            icon={Phone}
            title="No phone campaigns yet"
            description="Create your first phone campaign to start engaging your audience."
          />
      ) : (
        <div className="grid gap-4">
          {phoneCampaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardHeader>
                <CardTitle>{campaign.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <PhoneCampaignPanel
                  campaign={{
                    id: campaign.id,
                    name: campaign.name,
                    status: campaign.status,
                    dialMode: campaign.dialMode,
                  }}
                  queueStats={queueStats[campaign.id]}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
