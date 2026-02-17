import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Users,
  Phone,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const getToken = () => localStorage.getItem('clientPortalToken');

type QueueStatus = "queued" | "in_progress" | "done" | "skipped" | "removed";

interface QueueItem {
  id: string;
  campaignId: string;
  contactId: string;
  accountId: string;
  status: QueueStatus;
  queuedAt: string;
  processedAt?: string;
  contact?: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
  };
  account?: {
    name: string;
  };
}

const statusConfig: Record<QueueStatus, { label: string; icon: any; color: string }> = {
  queued: { label: "Queued", icon: Clock, color: "border-blue-300/80 bg-blue-50/80 text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-300" },
  in_progress: { label: "In Progress", icon: RefreshCw, color: "border-amber-300/80 bg-amber-50/80 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-300" },
  done: { label: "Completed", icon: CheckCircle, color: "border-emerald-300/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300" },
  skipped: { label: "Skipped", icon: XCircle, color: "border-slate-300/80 bg-slate-100/80 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300" },
  removed: { label: "Removed", icon: XCircle, color: "border-rose-300/80 bg-rose-50/80 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-300" },
};

export default function ClientPortalCampaignQueue() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const { data: campaign } = useQuery({
    queryKey: ['client-portal-campaign', campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!campaignId,
  });

  const { data: queueItems = [], isLoading } = useQuery<QueueItem[]>({
    queryKey: ['client-portal-queue', campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/campaigns/${campaignId}/queue`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch queue');
      return res.json();
    },
    enabled: !!campaignId,
  });

  const queueStats = {
    total: queueItems.length,
    queued: queueItems.filter(i => i.status === "queued").length,
    inProgress: queueItems.filter(i => i.status === "in_progress").length,
    done: queueItems.filter(i => i.status === "done").length,
    skipped: queueItems.filter(i => i.status === "skipped").length,
    removed: queueItems.filter(i => i.status === "removed").length,
  };

  const statCards = [
    { key: "total", label: "Total", value: queueStats.total, icon: Users, iconTone: "text-slate-600 dark:text-slate-300" },
    { key: "queued", label: "Queued", value: queueStats.queued, icon: Clock, iconTone: "text-blue-600 dark:text-blue-400" },
    { key: "inProgress", label: "In Progress", value: queueStats.inProgress, icon: RefreshCw, iconTone: "text-amber-600 dark:text-amber-400" },
    { key: "done", label: "Completed", value: queueStats.done, icon: CheckCircle, iconTone: "text-emerald-600 dark:text-emerald-400" },
    { key: "skipped", label: "Skipped", value: queueStats.skipped, icon: XCircle, iconTone: "text-slate-600 dark:text-slate-300" },
    { key: "removed", label: "Removed", value: queueStats.removed, icon: XCircle, iconTone: "text-rose-600 dark:text-rose-400" },
  ] as const;

  return (
    <ClientPortalLayout>
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <Card className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/70 shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-start gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 mt-0.5 border-slate-300/80 dark:border-slate-700"
                onClick={() => setLocation("/client-portal/dashboard?tab=campaigns")}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Campaign Queue</p>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                  {campaign?.name || "Campaign Queue"}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">Live operational view of queued and processed contacts.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Queue Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.key} className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/80 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{card.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{card.value}</p>
                    </div>
                    <div className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                      <Icon className={`h-4 w-4 ${card.iconTone} ${card.key === "inProgress" ? "animate-spin" : ""}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Queue Items Table */}
        <Card className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/70 shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-200/70 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Phone className="w-5 h-5 text-violet-600" />
              Calling Queue
            </CardTitle>
            <CardDescription className="text-sm">
              {isLoading ? "Loading queue..." : `${queueItems.length} contact(s) currently tracked in queue`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70 dark:bg-slate-900/40">
                      <TableHead className="font-semibold">Contact</TableHead>
                      <TableHead className="font-semibold">Account</TableHead>
                      <TableHead className="font-semibold">Phone</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Queued At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queueItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                          No contacts in queue
                        </TableCell>
                      </TableRow>
                    ) : (
                      queueItems.map((item) => {
                        const StatusIcon = statusConfig[item.status].icon;
                        return (
                          <TableRow key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50 transition-colors">
                            <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                              {item.contact ? `${item.contact.firstName} ${item.contact.lastName}` : "Unknown Contact"}
                            </TableCell>
                            <TableCell className="text-slate-700 dark:text-slate-300">{item.account?.name || "Unknown Account"}</TableCell>
                            <TableCell className="font-mono text-sm text-slate-700 dark:text-slate-300">{item.contact?.phoneNumber || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusConfig[item.status].color}>
                                <StatusIcon className={`w-3 h-3 mr-1 ${item.status === "in_progress" ? "animate-spin" : ""}`} />
                                {statusConfig[item.status].label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(item.queuedAt).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ClientPortalLayout>
  );
}
