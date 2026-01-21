/**
 * Simple Email Campaign Create Page
 * 
 * New streamlined 3-page campaign creation flow
 * Following the "Collect intent first → design message second → execute immediately" principle
 */

import { SimpleCampaignBuilder } from "@/components/simple-campaign";

export default function SimpleEmailCampaignCreatePage() {
  return (
    <SimpleCampaignBuilder
      organizationName="DemandGentic.ai By Pivotal B2B"
      organizationAddress="123 Innovation Way, San Francisco, CA 94105"
    />
  );
}
