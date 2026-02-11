import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Mail,
  Loader2,
  Send,
  Eye,
  MousePointer,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

const getToken = () => localStorage.getItem('clientPortalToken');

interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  totalRecipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  scheduled: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  sending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  sent: 'bg-green-500/10 text-green-600 border-green-500/20',
  completed: 'bg-green-500/10 text-green-600 border-green-500/20',
  failed: 'bg-red-500/10 text-red-600 border-red-500/20',
  paused: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

export default function ClientPortalEmailCampaigns() {
  const { data: emailCampaigns = [], isLoading } = useQuery<EmailCampaign[]>({
    queryKey: ['client-portal-email-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/email-campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch email campaigns');
      return res.json();
    },
  });

  const totalSent = emailCampaigns.reduce((sum, c) => sum + (c.sent || 0), 0);
  const totalOpened = emailCampaigns.reduce((sum, c) => sum + (c.opened || 0), 0);
  const totalClicked = emailCampaigns.reduce((sum, c) => sum + (c.clicked || 0), 0);
  const overallOpenRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
  const overallClickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

  return (
    <ClientPortalLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-500/10 via-primary/5 to-transparent rounded-2xl p-6 md:p-8 border border-blue-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                <Mail className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Email Campaigns</h1>
            </div>
            <p className="text-foreground/70 mt-2">View email campaign performance and metrics</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{emailCampaigns.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
                  <Send className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalSent.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overallOpenRate}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
                  <MousePointer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overallClickRate}%</div>
                </CardContent>
              </Card>
            </div>

            {/* Campaigns List */}
            {emailCampaigns.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <Mail className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold">No Email Campaigns</h3>
                  <p className="text-muted-foreground mt-2 max-w-md">
                    Email campaign data will appear here once campaigns are created and assigned.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {emailCampaigns.map((campaign) => {
                  const openRate = campaign.sent > 0 ? Math.round((campaign.opened / campaign.sent) * 100) : 0;
                  const clickRate = campaign.sent > 0 ? Math.round((campaign.clicked / campaign.sent) * 100) : 0;
                  const deliveryRate = campaign.sent > 0 ? Math.round((campaign.delivered / campaign.sent) * 100) : 0;

                  return (
                    <Card key={campaign.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{campaign.name}</CardTitle>
                            <CardDescription className="mt-1">
                              Subject: {campaign.subject}
                            </CardDescription>
                          </div>
                          <Badge variant="outline" className={statusColors[campaign.status] || ''}>
                            {campaign.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" /> Recipients
                            </p>
                            <p className="font-semibold text-lg">{campaign.totalRecipients.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground flex items-center gap-1">
                              <Send className="h-3 w-3" /> Sent
                            </p>
                            <p className="font-semibold text-lg">{campaign.sent.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" /> Delivered
                            </p>
                            <p className="font-semibold text-lg">{deliveryRate}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground flex items-center gap-1">
                              <Eye className="h-3 w-3" /> Opened
                            </p>
                            <p className="font-semibold text-lg text-blue-600">{openRate}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground flex items-center gap-1">
                              <MousePointer className="h-3 w-3" /> Clicked
                            </p>
                            <p className="font-semibold text-lg text-green-600">{clickRate}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> Bounced
                            </p>
                            <p className="font-semibold text-lg text-red-600">{campaign.bounced}</p>
                          </div>
                        </div>
                        {campaign.sentAt && (
                          <p className="text-xs text-muted-foreground mt-4">
                            Sent on {new Date(campaign.sentAt).toLocaleDateString()} at {new Date(campaign.sentAt).toLocaleTimeString()}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </ClientPortalLayout>
  );
}
