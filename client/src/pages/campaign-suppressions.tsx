import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CampaignSuppressionManager } from "@/components/campaign-suppression-manager";
import { Skeleton } from "@/components/ui/skeleton";

export default function CampaignSuppressionsPage() {
  const [, params] = useRoute("/campaigns/:id/suppressions");
  const campaignId = params?.id;

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['/api/campaigns', campaignId],
    enabled: !!campaignId,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Campaign Not Found</CardTitle>
            <CardDescription>
              The requested campaign could not be found.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={campaign.type === 'email' ? '/campaigns/email' : '/campaigns/telemarketing'}>
          <Button variant="outline" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-muted-foreground">
            Manage campaign-level suppressions: emails, accounts, domains, and contacts
          </p>
        </div>
      </div>

      {/* Suppression Manager */}
      {campaignId && <CampaignSuppressionManager campaignId={campaignId} />}
    </div>
  );
}
