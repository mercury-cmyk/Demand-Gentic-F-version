import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { CampaignPlannerUnderConstruction } from "@/components/client-portal/campaign-planner-under-construction";

export default function ClientPortalCampaignPlannerPage() {
  return (
    <ClientPortalLayout>
      <CampaignPlannerUnderConstruction />
    </ClientPortalLayout>
  );
}
