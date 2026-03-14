import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, Play, Loader2, Clock, Phone, AlertCircle } from "lucide-react";

const getToken = () => localStorage.getItem('clientPortalToken');

interface Recording {
  id: string;
  contactName: string;
  campaignName: string;
  durationSec: number;
  aiDisposition: string;
  recordingUrl: string;
  createdAt: string;
}

export default function ClientPortalRecordings() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);

  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-recordings'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
  });

  const campaigns = [
    ...(campaignsData?.verificationCampaigns || []),
    ...(campaignsData?.regularCampaigns || []),
  ];

  const { data: recordings = [], isLoading } = useQuery<Recording[]>({
    queryKey: ['client-portal-recordings', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/recordings?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch recordings');
      return res.json();
    },
  });

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <ClientPortalLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-rose-500/10 via-primary/5 to-transparent rounded-2xl p-6 md:p-8 border border-rose-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shadow-lg">
                <Mic className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Call Recordings</h1>
            </div>
            <p className="text-foreground/70 mt-2">Listen to and review call recordings from your campaigns</p>
          </div>
        </div>

        {/* Campaign Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-foreground/70">Campaign</label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="All Campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
                  <Mic className="h-5 w-5 text-rose-500" />
                </div>
                <div>
                  <p className="text-sm text-foreground/70">Total Recordings</p>
                  <p className="text-2xl font-bold">{recordings.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-foreground/70">Total Duration</p>
                  <p className="text-2xl font-bold">
                    {formatDuration(recordings.reduce((sum, r) => sum + (r.durationSec || 0), 0))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Phone className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-foreground/70">Avg Duration</p>
                  <p className="text-2xl font-bold">
                    {recordings.length > 0
                      ? formatDuration(Math.round(recordings.reduce((sum, r) => sum + (r.durationSec || 0), 0) / recordings.length))
                      : '0:00'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recordings List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recordings</CardTitle>
            <CardDescription>{recordings.length} recordings available</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : recordings.length === 0 ? (
              <div className="text-center py-12 text-foreground/50">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No recordings available for your campaigns</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Disposition</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-center">Play</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recordings.map((rec) => (
                      <TableRow key={rec.id}>
                        <TableCell className="font-medium">{rec.contactName || 'Unknown'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{rec.campaignName || '—'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">
                            {(rec.aiDisposition || 'unknown').replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-foreground/70">
                          {formatDuration(rec.durationSec || 0)}
                        </TableCell>
                        <TableCell className="text-foreground/70 text-sm">
                          {rec.createdAt ? new Date(rec.createdAt).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {rec.recordingUrl ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPlayingId(playingId === rec.id ? null : rec.id)}
                              className="gap-1"
                            >
                              <Play className="h-4 w-4" />
                              {playingId === rec.id ? 'Stop' : 'Play'}
                            </Button>
                          ) : (
                            <span className="text-foreground/30 text-xs">No audio</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Audio Player */}
                {playingId && (() => {
                  const rec = recordings.find(r => r.id === playingId);
                  return rec?.recordingUrl ? (
                    <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-4 mt-4">
                      <div className="flex items-center gap-3">
                        <Mic className="h-4 w-4 text-rose-500" />
                        <span className="text-sm font-medium">{rec.contactName || 'Recording'}</span>
                        <audio controls autoPlay src={rec.recordingUrl} className="flex-1 h-8" onEnded={() => setPlayingId(null)} />
                      </div>
                    </div>
                  ) : null;
                })()}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </ClientPortalLayout>
  );
}
