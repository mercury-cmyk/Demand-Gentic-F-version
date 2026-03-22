import { Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

type MetricValue = number | null | undefined;

export type EmailPerformanceSnapshot = {
  totalRecipients?: MetricValue;
  delivered?: MetricValue;
  opens?: MetricValue;
  clicks?: MetricValue;
  unsubscribes?: MetricValue;
  spamComplaints?: MetricValue;
};

export type CallPerformanceSnapshot = {
  contactsInQueue?: MetricValue;
  callsMade?: MetricValue;
  callsConnected?: MetricValue;
  leadsQualified?: MetricValue;
  dncRequests?: MetricValue;
  notInterested?: MetricValue;
  noAnswer?: MetricValue;
  voicemail?: MetricValue;
  busy?: MetricValue;
  wrongNumber?: MetricValue;
  callbackRequested?: MetricValue;
  noDisposition?: MetricValue;
};

export type CampaignPerformanceSnapshotData = {
  email?: EmailPerformanceSnapshot | null;
  call?: CallPerformanceSnapshot | null;
};

type CampaignPerformanceSnapshotProps = {
  data?: CampaignPerformanceSnapshotData | null;
  isLoading?: boolean;
  className?: string;
};

const formatMetric = (value: MetricValue, isLoading?: boolean) => {
  if (isLoading) return "...";
  if (value === null || value === undefined) return "--";
  return value.toLocaleString();
};

const MetricItem = ({
  label,
  value,
  isLoading,
  onClick,
  clickable
}: {
  label: string;
  value: MetricValue;
  isLoading?: boolean;
  onClick?: () => void;
  clickable?: boolean;
}) => (
  
    
      {label}
    
    
      {formatMetric(value, isLoading)}
    
  
);

export function CampaignPerformanceSnapshot({
  data,
  isLoading,
  className,
  campaignId
}: CampaignPerformanceSnapshotProps & { campaignId?: string }) {
  const [, setLocation] = useLocation();
  const email = data?.email ?? null;
  const call = data?.call ?? null;

  // Helper to route to contacts filtered by campaign/event
  const goToContacts = (eventType: string) => {
    if (!campaignId) return;
    setLocation(`/contacts?campaignId=${campaignId}&event=${eventType}`);
  };

  return (
    
      
        
          
          Email Performance
        
        
          
          
           goToContacts('open')} />
           goToContacts('click')} />
          
           goToContacts('complained')} />
        
      

      
        
          
          Call Performance
        
        
          
          
          
          
          
          
          
          
          
          
          
          
        
      
    
  );
}