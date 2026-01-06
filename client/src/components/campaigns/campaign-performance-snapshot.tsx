import { Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

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
}: {
  label: string;
  value: MetricValue;
  isLoading?: boolean;
}) => (
  <div className="rounded-md border bg-background/70 px-3 py-2">
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
    <div className="text-base font-semibold text-foreground">
      {formatMetric(value, isLoading)}
    </div>
  </div>
);

export function CampaignPerformanceSnapshot({
  data,
  isLoading,
  className,
}: CampaignPerformanceSnapshotProps) {
  const email = data?.email ?? null;
  const call = data?.call ?? null;

  return (
    <div className={cn("rounded-xl border bg-muted/20 p-4 space-y-4", className)}>
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Mail className="h-4 w-4 text-blue-500" />
          Email Performance
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <MetricItem label="Recipients" value={email?.totalRecipients} isLoading={isLoading} />
          <MetricItem label="Delivered" value={email?.delivered} isLoading={isLoading} />
          <MetricItem label="Opens" value={email?.opens} isLoading={isLoading} />
          <MetricItem label="Clicks" value={email?.clicks} isLoading={isLoading} />
          <MetricItem label="Unsubscribes" value={email?.unsubscribes} isLoading={isLoading} />
          <MetricItem label="Spam Complaints" value={email?.spamComplaints} isLoading={isLoading} />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Phone className="h-4 w-4 text-emerald-500" />
          Call Performance
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <MetricItem label="Contacts in Queue" value={call?.contactsInQueue} isLoading={isLoading} />
          <MetricItem label="Calls Made" value={call?.callsMade} isLoading={isLoading} />
          <MetricItem label="Calls Connected" value={call?.callsConnected} isLoading={isLoading} />
          <MetricItem label="Leads Qualified" value={call?.leadsQualified} isLoading={isLoading} />
          <MetricItem label="DNC Requests" value={call?.dncRequests} isLoading={isLoading} />
          <MetricItem label="Not Interested" value={call?.notInterested} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
