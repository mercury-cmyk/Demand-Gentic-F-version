import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Mic,
  Play,
  Pause,
  Search,
  Loader2,
  Clock,
  Phone,
  Download,
} from "lucide-react";

const getToken = () => localStorage.getItem('clientPortalToken');

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

interface Recording {
  id: string;
  campaignId: string;
  campaignName: string;
  contactName: string;
  accountName: string;
  phoneNumber: string;
  disposition: string;
  duration: number;
  recordingUrl: string | null;
  transcript: string | null;
  createdAt: string;
}

export default function ClientPortalCallRecordings() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch campaigns
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

  // Fetch recordings
  const { data: recordings = [], isLoading } = useQuery<Recording[]>({
    queryKey: ['client-portal-recordings', selectedCampaign, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      if (search) params.append('search', search);
      const res = await fetch(`/api/client-portal/recordings?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch recordings');
      return res.json();
    },
  });

  const handlePlay = (recording: Recording) => {
    if (playingId === recording.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (recording.recordingUrl) {
      const audio = new Audio(recording.recordingUrl);
      audio.play();
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(recording.id);
    }
  };

  return (
    <ClientPortalLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-purple-500/10 via-primary/5 to-transparent rounded-2xl p-6 md:p-8 border border-purple-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Mic className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Call Recordings</h1>
            </div>
            <p className="text-foreground/70 mt-2">Listen to call recordings from your campaigns</p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Campaign</label>
                <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    {campaigns.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search by contact or account..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recordings Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recordings</CardTitle>
            <CardDescription>
              {isLoading ? "Loading..." : `${recordings.length} recording(s) found`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : recordings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Mic className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold">No Recordings Found</h3>
                <p className="text-muted-foreground mt-2">
                  Recordings will appear here once campaigns start making calls.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Disposition</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Play</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recordings.map((rec) => (
                    <TableRow key={rec.id}>
                      <TableCell className="font-medium">{rec.contactName}</TableCell>
                      <TableCell>{rec.accountName}</TableCell>
                      <TableCell>{rec.campaignName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {rec.disposition?.replace(/_/g, ' ') || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3" />
                          {formatDuration(rec.duration || 0)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(rec.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {rec.recordingUrl ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePlay(rec)}
                          >
                            {playingId === rec.id ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ClientPortalLayout>
  );
}
