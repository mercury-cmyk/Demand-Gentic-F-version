import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  CheckCircle2
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";

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
  campaignId: string | null;
  campaignName: string | null;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  agentType: string | null;
  disposition: string | null;
  recordingStatus: string | null;
  recordingDurationSec: number | null;
  recordingFileSizeBytes: number | null;
  recordingFormat: string | null;
  startedAt: string | null;
  endedAt: string | null;
  transcript: string | null;
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
function AudioPlayer({ recordingId, onClose }: { recordingId: string; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch presigned URL for this recording
  const { data: urlData, isLoading: urlLoading, error: urlError } = useQuery({
    queryKey: ['/api/recordings', recordingId, 'url'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/recordings/${recordingId}/url`);
      return response.json();
    },
  });

  useEffect(() => {
    if (urlData?.url && audioRef.current) {
      audioRef.current.src = urlData.url;
      audioRef.current.load();
    }
  }, [urlData?.url]);

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

  if (urlLoading) {
    return (
      <div className="flex items-center justify-center p-4 bg-muted rounded-lg">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span>Loading audio...</span>
      </div>
    );
  }

  if (urlError || error || !urlData?.url) {
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
            <a href={urlData.url} download target="_blank" rel="noopener noreferrer">
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
  const isAdmin = user?.role === 'admin' || user?.role === 'campaign_manager';
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [expandedRecording, setExpandedRecording] = useState<string | null>(null);
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

  // Build query params
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
    if (searchQuery.trim()) params.append('search', searchQuery.trim());
    return params.toString();
  };

  // Fetch recordings
  const { 
    data: recordingsData, 
    isLoading: recordingsLoading, 
    refetch: refetchRecordings 
  } = useQuery<RecordingsResponse>({
    queryKey: ['/api/recordings', page, selectedCampaign, searchQuery],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/recordings?${buildQueryParams()}`);
      return response.json();
    },
  });

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery<RecordingStats>({
    queryKey: ['/api/recordings/stats/summary'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/recordings/stats/summary');
      return response.json();
    },
  });

  const recordings = recordingsData?.recordings || [];
  const pagination = recordingsData?.pagination;

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedCampaign, searchQuery]);

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
            Browse, search, and playback all call recordings
          </p>
        </div>
        <Button onClick={() => refetchRecordings()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
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
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[300px]">
              <label className="text-sm font-medium mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by contact name, phone, or agent..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="min-w-[200px]">
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
                          {recording.contactName || 'Unknown Contact'}
                        </span>
                        {recording.contactPhone && (
                          <span className="text-muted-foreground text-sm">
                            ({recording.contactPhone})
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {recording.campaignName && (
                          <Badge variant="outline" className="text-xs">
                            {recording.campaignName}
                          </Badge>
                        )}
                        
                        {recording.agentType && (
                          <Badge className={`text-xs text-white ${AGENT_TYPE_COLORS[recording.agentType] || 'bg-gray-500'}`}>
                            {recording.agentType === 'ai_agent' && <Bot className="h-3 w-3 mr-1" />}
                            {recording.agentType === 'human_agent' && <User className="h-3 w-3 mr-1" />}
                            {recording.agentType.replace('_', ' ')}
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

                    {/* Right side - Play button */}
                    <div className="flex items-center gap-2">
                      {recording.recordingStatus === 'stored' ? (
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
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          {recording.recordingStatus === 'pending' && 'Awaiting upload'}
                          {recording.recordingStatus === 'recording' && 'Recording in progress'}
                          {recording.recordingStatus === 'uploading' && 'Uploading...'}
                          {recording.recordingStatus === 'failed' && 'Upload failed'}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Expanded audio player */}
                  {expandedRecording === recording.id && (
                    <div className="mt-4">
                      <AudioPlayer
                        recordingId={recording.id}
                        onClose={() => setExpandedRecording(null)}
                      />
                      
                      {/* Show transcript if available */}
                      {recording.transcript && (
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                          <h4 className="text-sm font-medium mb-2">Transcript</h4>
                          <ScrollArea className="h-32">
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {recording.transcript}
                            </p>
                          </ScrollArea>
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
