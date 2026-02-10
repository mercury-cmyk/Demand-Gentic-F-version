import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Mic,
  Play,
  Pause,
  Download,
  Search,
  Clock,
  Calendar,
  Phone,
  User,
  Bot,
  RefreshCw,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  FileAudio,
  HardDrive,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  Filter,
  Cloud,
  Database,
  Layers,
  Hash,
  Star,
  UserPlus,
  Send,
  Zap
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Recording status badge colors
const STATUS_COLORS: Record<string, string> = {
  stored: 'bg-green-500',
  pending: 'bg-yellow-500',
  recording: 'bg-blue-500',
  uploading: 'bg-purple-500',
  failed: 'bg-red-500',
};

// Agent type badge colors
const AGENT_TYPE_COLORS: Record<string, string> = {
  ai: 'bg-purple-600',
  human: 'bg-blue-600',
};

// Source badge colors
const SOURCE_COLORS: Record<string, string> = {
  local: 'bg-blue-500',
  telnyx: 'bg-orange-500',
};

// Format duration in minutes:seconds
function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format file size in human-readable format
function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Format date for display
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

interface Recording {
  id: string;
  telnyxCallId?: string | null;
  campaignId: string | null;
  campaignName: string | null;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
  agentType: string | null;
  agentName?: string | null;
  disposition: string | null;
  recordingStatus: string | null;
  durationSec?: number | null; // Call duration in seconds
  recordingDurationSec: number | null;
  recordingFileSizeBytes: number | null;
  recordingFormat: string | null;
  recordingUrl?: string | null;
  recordingS3Key?: string | null; // GCS storage key (if stored permanently)
  startedAt: string | null;
  endedAt: string | null;
  transcript?: string | null;
  hasTranscript?: boolean;
  hasRecording?: boolean;
  source?: string;
  // Lead tracking
  leadId?: string | null; // If this recording is already linked to a lead
  leadQaStatus?: string | null; // QA status of linked lead
}

interface RecordingsResponse {
  recordings: Recording[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface RecordingStats {
  totalRecordings: number;
  byStatus: { status: string; count: number }[];
  totalDurationSeconds: number;
  totalFileSizeBytes: number;
}

// Audio player component with full controls
function AudioPlayer({ recordingId, recordingUrl, onClose }: { recordingId: string; recordingUrl?: string | null; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Always use our stream endpoint to proxy the audio (bypasses CORS issues with Telnyx)
  const audioUrl = `/api/recordings/${recordingId}/stream`;

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.load();
    }
  }, [audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleCanPlay = () => setIsLoading(false);
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      setError('Failed to load audio');
      setIsLoading(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (value: number[]) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    if (!audioRef.current) return;
    audioRef.current.volume = value[0];
    setVolume(value[0]);
  };

  // Only show loading if we're setting up audio
  if (isLoading && !audioUrl) {
    return (
      <div className="flex items-center justify-center p-4 bg-muted rounded-lg">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span>Loading audio...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-4 bg-destructive/10 rounded-lg text-destructive">
        <AlertCircle className="h-5 w-5 mr-2" />
        <span>{error || 'Failed to load recording'}</span>
        <Button variant="ghost" size="sm" onClick={onClose} className="ml-4">
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-muted p-4 rounded-lg space-y-3">
      <audio ref={audioRef} preload="metadata" />
      
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground w-12">
          {formatDuration(currentTime)}
        </span>
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={0.1}
          onValueChange={handleSeek}
          className="flex-1"
        />
        <span className="text-sm text-muted-foreground w-12">
          {formatDuration(duration)}
        </span>
      </div>
      
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={togglePlay}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          
          <Button variant="ghost" size="icon" onClick={toggleMute}>
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          
          <Slider
            value={[isMuted ? 0 : volume]}
            max={1}
            step={0.01}
            onValueChange={handleVolumeChange}
            className="w-24"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a href={audioUrl} download target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-1" />
              Download
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CallRecordingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin' || user?.role === 'campaign_manager' || user?.role === 'quality_analyst';
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [callIdFilter, setCallIdFilter] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minDurationSec, setMinDurationSec] = useState('');
  const [maxDurationSec, setMaxDurationSec] = useState('');
  const [page, setPage] = useState(1);
  const [expandedRecording, setExpandedRecording] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const limit = 20;

  // Fetch campaigns for filter
  const { data: campaigns = [] } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/campaigns');
      return response.json();
    },
  });

  const callCampaigns = campaigns.filter((c: any) => c.type === 'call');

  // Build query params - now using the /all endpoint
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('source', selectedSource);
    if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
    if (searchQuery.trim()) params.append('search', searchQuery.trim());
    if (phoneFilter.trim()) params.append('phoneNumber', phoneFilter.trim());
    if (callIdFilter.trim()) params.append('callId', callIdFilter.trim());
    if (startDate) params.append('startDate', new Date(startDate).toISOString());
    if (endDate) params.append('endDate', new Date(endDate).toISOString());
    const parsedMin = Number(minDurationSec);
    if (minDurationSec && !Number.isNaN(parsedMin)) {
      params.append('minDurationSec', Math.max(0, Math.round(parsedMin)).toString());
    }
    const parsedMax = Number(maxDurationSec);
    if (maxDurationSec && !Number.isNaN(parsedMax)) {
      params.append('maxDurationSec', Math.max(0, Math.round(parsedMax)).toString());
    }
    return params.toString();
  };

  // Auto-refresh state - poll every 10 seconds for real-time updates
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const AUTO_REFRESH_INTERVAL = 10000; // 10 seconds

  // Fetch recordings from unified endpoint with auto-refresh
  const {
    data: recordingsData,
    isLoading: recordingsLoading,
    refetch: refetchRecordings
  } = useQuery<RecordingsResponse>({
    queryKey: ['/api/recordings/all', page, selectedCampaign, searchQuery, phoneFilter, callIdFilter, selectedSource, startDate, endDate, minDurationSec, maxDurationSec],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/recordings/all?${buildQueryParams()}`);
      return response.json();
    },
    // Auto-refresh every 10 seconds when enabled
    refetchInterval: autoRefreshEnabled ? AUTO_REFRESH_INTERVAL : false,
    refetchIntervalInBackground: false, // Only refresh when tab is active
  });

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery<RecordingStats>({
    queryKey: ['/api/recordings/stats/summary'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/recordings/stats/summary');
      return response.json();
    },
  });

  // Sync recordings from Telnyx mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const body: any = {};
      if (startDate) body.startDate = startDate;
      if (endDate) body.endDate = endDate;
      if (phoneFilter.trim()) body.phoneNumber = phoneFilter.trim();
      
      const response = await apiRequest('POST', '/api/recordings/telnyx/sync', body);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Sync Complete',
        description: `Synced ${data.data?.newRecordings || 0} new recordings from Telnyx`,
      });
      refetchRecordings();
      queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync recordings from Telnyx',
        variant: 'destructive',
      });
    },
  });

  // Transcribe recording mutation
  const transcribeMutation = useMutation({
    mutationFn: async ({ recordingId, source }: { recordingId: string; source?: string }) => {
      const response = await apiRequest('POST', `/api/recordings/${recordingId}/transcribe`, { source });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Transcription Started',
        description: 'The recording is being transcribed. Check back in a few minutes.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Transcription Failed',
        description: error.message || 'Failed to start transcription',
        variant: 'destructive',
      });
    },
  });

  // Push to Qualified Lead mutation
  const pushToLeadMutation = useMutation({
    mutationFn: async ({ recordingId, notes }: { recordingId: string; notes?: string }) => {
      const response = await apiRequest('POST', `/api/recordings/${recordingId}/push-to-lead`, { notes });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Lead Created',
        description: `Recording has been pushed to QA as a qualified lead (ID: ${data.leadId?.substring(0, 8)}...)`,
      });
      // Refresh to update the recording's lead status
      refetchRecordings();
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Create Lead',
        description: error.message || 'Could not push recording to qualified lead',
        variant: 'destructive',
      });
    },
  });

  // Retry sync for failed recordings
  const retrySyncMutation = useMutation({
    mutationFn: async ({ recordingId }: { recordingId: string }) => {
      const response = await apiRequest('POST', `/api/recordings/${recordingId}/retry-sync`, { transcribe: true });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Recording Synced',
        description: data.data?.transcriptStatus === 'completed'
          ? 'Recording recovered and transcription completed!'
          : 'Recording recovered from Telnyx and stored.',
      });
      refetchRecordings();
    },
    onError: (error: any) => {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Could not recover recording from Telnyx. It may have been deleted.',
        variant: 'destructive',
      });
    },
  });

  const recordings = recordingsData?.recordings || [];
  const pagination = recordingsData?.pagination;

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [
    selectedCampaign,
    searchQuery,
    phoneFilter,
    callIdFilter,
    selectedSource,
    startDate,
    endDate,
    minDurationSec,
    maxDurationSec,
  ]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Mic className="h-8 w-8" />
            Call Recordings
          </h1>
          <p className="text-muted-foreground mt-1">
            Browse, search, and playback all call recordings from Telnyx
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Auto-refresh indicator */}
          <Button
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            variant={autoRefreshEnabled ? "default" : "outline"}
            size="sm"
            title={autoRefreshEnabled ? "Auto-refresh ON (every 10s)" : "Auto-refresh OFF"}
          >
            <Zap className={`h-4 w-4 mr-1 ${autoRefreshEnabled ? 'text-yellow-300' : ''}`} />
            {autoRefreshEnabled ? 'Live' : 'Paused'}
          </Button>
          <Button
            onClick={() => syncMutation.mutate()}
            variant="outline"
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Cloud className="h-4 w-4 mr-2" />
            )}
            Sync from Telnyx
          </Button>
          <Button onClick={() => refetchRecordings()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Recordings</CardTitle>
            <FileAudio className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '--' : stats?.totalRecordings?.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stored</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {statsLoading ? '--' : 
                stats?.byStatus?.find(s => s.status === 'stored')?.count?.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '--' : 
                `${Math.round((stats?.totalDurationSeconds || 0) / 3600)}h ${Math.round(((stats?.totalDurationSeconds || 0) % 3600) / 60)}m`}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '--' : formatFileSize(stats?.totalFileSizeBytes)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Primary Filters Row */}
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[250px]">
                <label className="text-sm font-medium mb-2 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by contact name or agent..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="min-w-[180px]">
                <label className="text-sm font-medium mb-2 block flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Phone Number
                </label>
                <Input
                  placeholder="Filter by phone..."
                  value={phoneFilter}
                  onChange={(e) => setPhoneFilter(e.target.value)}
                />
              </div>

              <div className="min-w-[180px]">
                <label className="text-sm font-medium mb-2 block flex items-center gap-1">
                  <Hash className="h-3 w-3" /> Call ID
                </label>
                <Input
                  placeholder="Telnyx Call ID..."
                  value={callIdFilter}
                  onChange={(e) => setCallIdFilter(e.target.value)}
                />
              </div>

              <div className="min-w-[150px]">
                <label className="text-sm font-medium mb-2 block">Source</label>
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <span className="flex items-center gap-2">
                        <Layers className="h-3 w-3" /> All Sources
                      </span>
                    </SelectItem>
                    <SelectItem value="local">
                      <span className="flex items-center gap-2">
                        <Database className="h-3 w-3" /> Local Database
                      </span>
                    </SelectItem>
                    <SelectItem value="telnyx">
                      <span className="flex items-center gap-2">
                        <Cloud className="h-3 w-3" /> Telnyx API
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                <Filter className="h-4 w-4 mr-1" />
                {showAdvancedFilters ? 'Hide' : 'More'} Filters
              </Button>
            </div>

            {/* Advanced Filters Row */}
            {showAdvancedFilters && (
              <div className="flex flex-wrap gap-4 items-end pt-2 border-t">
                <div className="min-w-[160px]">
                  <label className="text-sm font-medium mb-2 block">Campaign</label>
                  <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Campaigns" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Campaigns</SelectItem>
                      {callCampaigns.map((campaign: any) => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-[160px]">
                  <label className="text-sm font-medium mb-2 block flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Start Date
                  </label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div className="min-w-[160px]">
                  <label className="text-sm font-medium mb-2 block flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> End Date
                  </label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                <div className="min-w-[160px]">
                  <label className="text-sm font-medium mb-1 block flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Min Duration (sec)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Filter shorter calls"
                    value={minDurationSec}
                    onChange={(e) => setMinDurationSec(e.target.value)}
                  />
                </div>

                <div className="min-w-[160px]">
                  <label className="text-sm font-medium mb-1 block flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Max Duration (sec)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Cap long calls"
                    value={maxDurationSec}
                    onChange={(e) => setMaxDurationSec(e.target.value)}
                  />
                </div>

                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setPhoneFilter('');
                    setCallIdFilter('');
                    setSelectedCampaign('all');
                    setSelectedSource('all');
                    setStartDate('');
                    setEndDate('');
                    setMinDurationSec('');
                    setMaxDurationSec('');
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recordings List */}
      <Card>
        <CardHeader>
          <CardTitle>Recordings</CardTitle>
          <CardDescription>
            {pagination?.total 
              ? `Showing ${((page - 1) * limit) + 1}-${Math.min(page * limit, pagination.total)} of ${pagination.total.toLocaleString()} recordings`
              : 'No recordings found'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recordingsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : recordings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mic className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No recordings found matching your filters</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recordings.map((recording) => (
                <div
                  key={recording.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left side - Recording info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium truncate">
                          {recording.contactName || recording.toNumber || recording.contactPhone || 'Unknown Contact'}
                        </span>
                        {(recording.contactPhone || recording.toNumber) && recording.contactName && (
                          <span className="text-muted-foreground text-sm">
                            ({recording.contactPhone || recording.toNumber})
                          </span>
                        )}
                        {/* Show Telnyx call ID if available */}
                        {recording.telnyxCallId && (
                          <span className="text-xs text-muted-foreground font-mono truncate max-w-[150px]" title={recording.telnyxCallId}>
                            ID: {recording.telnyxCallId.substring(0, 12)}...
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {/* From/To numbers for Telnyx recordings */}
                        {recording.fromNumber && (
                          <Badge variant="outline" className="text-xs font-mono">
                            From: {recording.fromNumber}
                          </Badge>
                        )}
                        
                        {recording.campaignName && (
                          <Badge variant="outline" className="text-xs">
                            {recording.campaignName}
                          </Badge>
                        )}

                        {recording.agentType && (
                          <Badge className={`text-xs text-white ${AGENT_TYPE_COLORS[recording.agentType] || 'bg-gray-500'}`}>
                            {recording.agentType === 'ai' && <Bot className="h-3 w-3 mr-1" />}
                            {recording.agentType === 'human' && <User className="h-3 w-3 mr-1" />}
                            {recording.agentName || recording.agentType.replace('_', ' ')}
                          </Badge>
                        )}
                        
                        {recording.recordingStatus && (
                          <Badge className={`text-xs text-white ${STATUS_COLORS[recording.recordingStatus] || 'bg-gray-500'}`}>
                            {recording.recordingStatus}
                          </Badge>
                        )}
                        
                        {recording.disposition && (
                          <Badge variant="secondary" className="text-xs">
                            {recording.disposition.replace(/_/g, ' ')}
                          </Badge>
                        )}

                        {/* Transcript indicator */}
                        {recording.hasTranscript && (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                            <FileText className="h-3 w-3 mr-1" />
                            Transcribed
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {recording.startedAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(recording.startedAt)}
                          </span>
                        )}
                        {recording.recordingDurationSec && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(recording.recordingDurationSec)}
                          </span>
                        )}
                        {recording.recordingFileSizeBytes && (
                          <span>
                            {formatFileSize(recording.recordingFileSizeBytes)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side - Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Source badge */}
                      {recording.source && (
                        <Badge className={`text-xs text-white ${SOURCE_COLORS[recording.source] || 'bg-gray-500'}`}>
                          {recording.source === 'local' ? (
                            <><Database className="h-3 w-3 mr-1" /> Local</>
                          ) : (
                            <><Cloud className="h-3 w-3 mr-1" /> Telnyx</>
                          )}
                        </Badge>
                      )}

                      {/* Lead status badge or Push to Lead button */}
                      {recording.leadId ? (
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            recording.leadQaStatus === 'approved' ? 'text-green-600 border-green-600' :
                            recording.leadQaStatus === 'rejected' ? 'text-red-600 border-red-600' :
                            'text-yellow-600 border-yellow-600'
                          }`}
                        >
                          <Star className="h-3 w-3 mr-1" />
                          Lead ({recording.leadQaStatus || 'pending'})
                        </Badge>
                      ) : (
                        recording.campaignId && recording.contactId && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => pushToLeadMutation.mutate({ recordingId: recording.id })}
                            disabled={pushToLeadMutation.isPending}
                            title="Push this recording to QA as a qualified lead"
                            className="text-green-600 border-green-600 hover:bg-green-50"
                          >
                            {pushToLeadMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-1" />
                                Push to QA
                              </>
                            )}
                          </Button>
                        )
                      )}

                      {/* Transcribe button - only show if no transcript */}
                      {!recording.hasTranscript && recording.hasRecording !== false && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => transcribeMutation.mutate({
                            recordingId: recording.id,
                            source: recording.source
                          })}
                          disabled={transcribeMutation.isPending}
                          title="Transcribe this recording"
                        >
                          {transcribeMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                        </Button>
                      )}

                      {/* Play button */}
                      {recording.recordingStatus === 'stored' || recording.hasRecording ? (
                        <Button
                          variant={expandedRecording === recording.id ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => setExpandedRecording(
                            expandedRecording === recording.id ? null : recording.id
                          )}
                        >
                          {expandedRecording === recording.id ? (
                            <>
                              <Pause className="h-4 w-4 mr-1" />
                              Close
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-1" />
                              Play
                            </>
                          )}
                        </Button>
                      ) : recording.recordingStatus === 'failed' ? (
                        // Failed recording - show retry button
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retrySyncMutation.mutate({ recordingId: recording.id })}
                          disabled={retrySyncMutation.isPending}
                          className="text-orange-600 border-orange-600 hover:bg-orange-50"
                          title="Retry fetching recording from Telnyx"
                        >
                          {retrySyncMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          )}
                          Retry Sync
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          {recording.recordingStatus === 'pending' && 'Awaiting upload'}
                          {recording.recordingStatus === 'recording' && 'Recording in progress'}
                          {recording.recordingStatus === 'uploading' && 'Uploading...'}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Expanded audio player */}
                  {expandedRecording === recording.id && (
                    <div className="mt-4">
                      <AudioPlayer
                        recordingId={recording.id}
                        // Use direct URL in these cases:
                        // 1. GCS storage (recordingS3Key present) - permanent URL
                        // 2. Telnyx source - URL was just fetched from Telnyx API
                        // Only fetch fresh URL for local recordings without GCS storage
                        recordingUrl={
                          recording.recordingS3Key 
                            ? recording.recordingUrl 
                            : recording.source === 'telnyx' 
                              ? recording.recordingUrl 
                              : undefined
                        }
                        onClose={() => setExpandedRecording(null)}
                      />
                      
                      {/* Show transcript if available */}
                      {recording.hasTranscript && (
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Transcript
                          </h4>
                          <ScrollArea className="h-32">
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {recording.transcript || 'Transcript available - click to expand'}
                            </p>
                          </ScrollArea>
                        </div>
                      )}

                      {/* Show transcribe button in expanded view if no transcript */}
                      {!recording.hasTranscript && (
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              No transcript available
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => transcribeMutation.mutate({ 
                                recordingId: recording.id, 
                                source: recording.source 
                              })}
                              disabled={transcribeMutation.isPending}
                            >
                              {transcribeMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <FileText className="h-4 w-4 mr-1" />
                              )}
                              Transcribe Recording
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
