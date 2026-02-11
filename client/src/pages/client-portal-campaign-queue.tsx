import { useState } from "react";
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
  queued: { label: "Queued", icon: Clock, color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  in_progress: { label: "In Progress", icon: RefreshCw, color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  done: { label: "Completed", icon: CheckCircle, color: "bg-green-500/10 text-green-600 border-green-500/20" },
  skipped: { label: "Skipped", icon: XCircle, color: "bg-gray-500/10 text-gray-600 border-gray-500/20" },
  removed: { label: "Removed", icon: XCircle, color: "bg-red-500/10 text-red-600 border-red-500/20" },
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

  return (
    <ClientPortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/client-portal/dashboard?tab=campaigns")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{campaign?.name || "Campaign Queue"}</h1>
            <p className="text-muted-foreground">View calling queue status</p>
          </div>
        </div>

        {/* Queue Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{queueStats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-blue-600">Queued</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{queueStats.queued}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-yellow-600">In Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{queueStats.inProgress}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-green-600">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{queueStats.done}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Skipped</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">{queueStats.skipped}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-red-600">Removed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{queueStats.removed}</div>
            </CardContent>
          </Card>
        </div>

        {/* Queue Items Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Calling Queue
            </CardTitle>
            <CardDescription>
              {isLoading ? "Loading queue..." : `${queueItems.length} contact(s) in queue`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Queued At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No contacts in queue
                      </TableCell>
                    </TableRow>
                  ) : (
                    queueItems.map((item) => {
                      const StatusIcon = statusConfig[item.status].icon;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.contact ? `${item.contact.firstName} ${item.contact.lastName}` : "Unknown Contact"}
                          </TableCell>
                          <TableCell>{item.account?.name || "Unknown Account"}</TableCell>
                          <TableCell className="font-mono text-sm">{item.contact?.phoneNumber || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusConfig[item.status].color}>
                              <StatusIcon className="w-3 h-3 mr-1" />
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
            )}
          </CardContent>
        </Card>
      </div>
    </ClientPortalLayout>
  );
}
