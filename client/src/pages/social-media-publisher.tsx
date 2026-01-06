import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Share2, 
  ArrowLeft,
  Linkedin,
  Twitter,
  Facebook,
  Instagram,
  Youtube,
  Calendar,
  Upload,
  Link as LinkIcon,
  Send,
  Clock,
  BarChart3
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type SocialPost } from "@shared/schema";
import { SiLinkedin, SiFacebook, SiInstagram, SiYoutube } from "react-icons/si";

export default function SocialMediaPublisherPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [scheduleType, setScheduleType] = useState<"now" | "scheduled">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("social");
  const [utmCampaign, setUtmCampaign] = useState("");

  const { data: posts } = useQuery<SocialPost[]>({
    queryKey: ['/api/social-posts'],
  });

  const platforms = [
    { id: "linkedin", name: "LinkedIn", icon: SiLinkedin, color: "text-[#0077B5]", connected: true },
    { id: "twitter", name: "Twitter/X", icon: Twitter, color: "text-[#1DA1F2]", connected: true },
    { id: "facebook", name: "Facebook", icon: SiFacebook, color: "text-[#1877F2]", connected: false },
    { id: "instagram", name: "Instagram", icon: SiInstagram, color: "text-[#E4405F]", connected: false },
    { id: "youtube", name: "YouTube", icon: SiYoutube, color: "text-[#FF0000]", connected: false },
  ];

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platformId)
        ? prev.filter(p => p !== platformId)
        : [...prev, platformId]
    );
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlatforms.length) {
        throw new Error("Select at least one platform");
      }
      if (!content) {
        throw new Error("Content cannot be empty");
      }

      const postData = {
        content,
        mediaUrls,
        scheduledAt: scheduleType === "scheduled" ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString() : null,
        utmParameters: utmSource || utmCampaign ? {
          source: utmSource,
          medium: utmMedium,
          campaign: utmCampaign
        } : null,
        status: scheduleType === "now" ? "published" : "draft",
      };

      // Create post for each selected platform
      for (const platform of selectedPlatforms) {
        await apiRequest("POST", "/api/social-posts", {
          ...postData,
          platform,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/social-posts'] });
      toast({
        title: scheduleType === "now" ? "Published!" : "Scheduled!",
        description: `Post ${scheduleType === "now" ? "published" : "scheduled"} to ${selectedPlatforms.length} platform(s)`,
      });
      setContent("");
      setMediaUrls([]);
      setSelectedPlatforms([]);
    },
    onError: (error: any) => {
      toast({
        title: "Publishing Failed",
        description: error.message || "Failed to publish post",
        variant: "destructive",
      });
    },
  });

  const getCharacterCount = () => {
    if (selectedPlatforms.includes("twitter")) return `${content.length}/280`;
    if (selectedPlatforms.includes("linkedin")) return `${content.length}/3000`;
    return content.length.toString();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/content-studio")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Social Media Publisher</h1>
            <p className="text-muted-foreground mt-1">
              Create and schedule posts across multiple platforms
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setLocation("/content-studio/calendar")}>
          <Calendar className="w-4 h-4 mr-2" />
          View Calendar
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6">
          <Tabs defaultValue="composer">
            <TabsList>
              <TabsTrigger value="composer" data-testid="tab-composer">Composer</TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history">Post History</TabsTrigger>
              <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="composer" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Composer */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Create Post</CardTitle>
                    <CardDescription>Compose your message and select platforms</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Content</Label>
                        <span className="text-sm text-muted-foreground">{getCharacterCount()}</span>
                      </div>
                      <Textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="What's happening?"
                        rows={6}
                        data-testid="textarea-post-content"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Media (Optional)</Label>
                      <div className="flex gap-2">
                        <Input
                          type="url"
                          placeholder="Image or video URL"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && e.currentTarget.value) {
                              setMediaUrls([...mediaUrls, e.currentTarget.value]);
                              e.currentTarget.value = "";
                            }
                          }}
                          data-testid="input-media-url"
                        />
                        <Button variant="outline" size="icon">
                          <Upload className="w-4 h-4" />
                        </Button>
                      </div>
                      {mediaUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {mediaUrls.map((url, i) => (
                            <Badge key={i} variant="outline">
                              {url.substring(0, 30)}...
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Publishing Schedule</Label>
                      <div className="flex gap-4">
                        <Button
                          variant={scheduleType === "now" ? "default" : "outline"}
                          onClick={() => setScheduleType("now")}
                          className="flex-1"
                          data-testid="button-publish-now"
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Publish Now
                        </Button>
                        <Button
                          variant={scheduleType === "scheduled" ? "default" : "outline"}
                          onClick={() => setScheduleType("scheduled")}
                          className="flex-1"
                          data-testid="button-schedule"
                        >
                          <Clock className="w-4 h-4 mr-2" />
                          Schedule
                        </Button>
                      </div>
                    </div>

                    {scheduleType === "scheduled" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Date</Label>
                          <Input
                            type="date"
                            value={scheduledDate}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            data-testid="input-schedule-date"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Time</Label>
                          <Input
                            type="time"
                            value={scheduledTime}
                            onChange={(e) => setScheduledTime(e.target.value)}
                            data-testid="input-schedule-time"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>UTM Tracking (Optional)</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          placeholder="Source"
                          value={utmSource}
                          onChange={(e) => setUtmSource(e.target.value)}
                          data-testid="input-utm-source"
                        />
                        <Input
                          placeholder="Medium"
                          value={utmMedium}
                          onChange={(e) => setUtmMedium(e.target.value)}
                          data-testid="input-utm-medium"
                        />
                        <Input
                          placeholder="Campaign"
                          value={utmCampaign}
                          onChange={(e) => setUtmCampaign(e.target.value)}
                          data-testid="input-utm-campaign"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={() => publishMutation.mutate()}
                      disabled={publishMutation.isPending || !selectedPlatforms.length || !content}
                      className="w-full"
                      size="lg"
                      data-testid="button-publish"
                    >
                      {publishMutation.isPending ? "Publishing..." : scheduleType === "now" ? "Publish to Selected Platforms" : "Schedule Post"}
                    </Button>
                  </CardContent>
                </Card>

                {/* Platform Selection & Preview */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Select Platforms</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {platforms.map((platform) => {
                        const Icon = platform.icon;
                        return (
                          <div
                            key={platform.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              selectedPlatforms.includes(platform.id) ? 'border-primary bg-primary/5' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Icon className={`w-5 h-5 ${platform.color}`} />
                              <div>
                                <div className="font-medium">{platform.name}</div>
                                {!platform.connected && (
                                  <div className="text-xs text-muted-foreground">Not connected</div>
                                )}
                              </div>
                            </div>
                            <Checkbox
                              checked={selectedPlatforms.includes(platform.id)}
                              onCheckedChange={() => togglePlatform(platform.id)}
                              disabled={!platform.connected}
                              data-testid={`checkbox-platform-${platform.id}`}
                            />
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Post Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="p-4 bg-muted rounded-lg min-h-32">
                        {content ? (
                          <p className="text-sm whitespace-pre-wrap">{content}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">Preview will appear here...</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Post History</CardTitle>
                  <CardDescription>View and manage your social media posts</CardDescription>
                </CardHeader>
                <CardContent>
                  {posts && posts.length > 0 ? (
                    <div className="space-y-3">
                      {posts.slice(0, 10).map((post) => (
                        <div key={post.id} className="flex items-start gap-4 p-4 rounded-lg border">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="capitalize">{post.platform}</Badge>
                              {post.status === "published" && (
                                <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Published</Badge>
                              )}
                              {post.status === "draft" && (
                                <Badge variant="outline">Scheduled</Badge>
                              )}
                            </div>
                            <p className="text-sm mb-2 line-clamp-2">{post.content}</p>
                            <div className="text-xs text-muted-foreground">
                              {post.publishedAt ? new Date(post.publishedAt).toLocaleString() : 
                               post.scheduledAt ? `Scheduled: ${new Date(post.scheduledAt).toLocaleString()}` : 
                               new Date(post.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            <BarChart3 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Share2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No posts yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="analytics" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Total Impressions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">124.5K</div>
                    <p className="text-sm text-muted-foreground mt-1">+12% from last month</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Engagement Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">4.2%</div>
                    <p className="text-sm text-muted-foreground mt-1">+0.8% from last month</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Total Posts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{posts?.length || 0}</div>
                    <p className="text-sm text-muted-foreground mt-1">Across all platforms</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
