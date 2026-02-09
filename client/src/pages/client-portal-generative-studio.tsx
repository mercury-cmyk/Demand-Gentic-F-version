import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import GenerativeStudioPage from "@/pages/generative-studio";

export default function ClientPortalGenerativeStudio() {
  return (
    <ClientPortalLayout>
      <div className="h-full">
        <GenerativeStudioPage />
      </div>
    </ClientPortalLayout>
  );
}
