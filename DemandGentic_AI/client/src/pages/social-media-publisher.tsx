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

  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [content, setContent] = useState("");
  const [mediaUrls, setMediaUrls] = useState([]);
  const [scheduleType, setScheduleType] = useState("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("social");
  const [utmCampaign, setUtmCampaign] = useState("");

  const { data: posts } = useQuery({
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
    
      {/* Header */}
      
        
           setLocation("/content-studio")}>
            
          
          
            Social Media Publisher
            
              Create and schedule posts across multiple platforms
            
          
        
         setLocation("/content-studio/calendar")}>
          
          View Calendar
        
      

      
        
          
            
              Composer
              Post History
              Analytics
            

            
              
                {/* Composer */}
                
                  
                    Create Post
                    Compose your message and select platforms
                  
                  
                    
                      
                        Content
                        {getCharacterCount()}
                      
                       setContent(e.target.value)}
                        placeholder="What's happening?"
                        rows={6}
                        data-testid="textarea-post-content"
                      />
                    

                    
                      Media (Optional)
                      
                         {
                            if (e.key === "Enter" && e.currentTarget.value) {
                              setMediaUrls([...mediaUrls, e.currentTarget.value]);
                              e.currentTarget.value = "";
                            }
                          }}
                          data-testid="input-media-url"
                        />
                        
                          
                        
                      
                      {mediaUrls.length > 0 && (
                        
                          {mediaUrls.map((url, i) => (
                            
                              {url.substring(0, 30)}...
                            
                          ))}
                        
                      )}
                    

                    
                      Publishing Schedule
                      
                         setScheduleType("now")}
                          className="flex-1"
                          data-testid="button-publish-now"
                        >
                          
                          Publish Now
                        
                         setScheduleType("scheduled")}
                          className="flex-1"
                          data-testid="button-schedule"
                        >
                          
                          Schedule
                        
                      
                    

                    {scheduleType === "scheduled" && (
                      
                        
                          Date
                           setScheduledDate(e.target.value)}
                            data-testid="input-schedule-date"
                          />
                        
                        
                          Time
                           setScheduledTime(e.target.value)}
                            data-testid="input-schedule-time"
                          />
                        
                      
                    )}

                    
                      UTM Tracking (Optional)
                      
                         setUtmSource(e.target.value)}
                          data-testid="input-utm-source"
                        />
                         setUtmMedium(e.target.value)}
                          data-testid="input-utm-medium"
                        />
                         setUtmCampaign(e.target.value)}
                          data-testid="input-utm-campaign"
                        />
                      
                    

                     publishMutation.mutate()}
                      disabled={publishMutation.isPending || !selectedPlatforms.length || !content}
                      className="w-full"
                      size="lg"
                      data-testid="button-publish"
                    >
                      {publishMutation.isPending ? "Publishing..." : scheduleType === "now" ? "Publish to Selected Platforms" : "Schedule Post"}
                    
                  
                

                {/* Platform Selection & Preview */}
                
                  
                    
                      Select Platforms
                    
                    
                      {platforms.map((platform) => {
                        const Icon = platform.icon;
                        return (
                          
                            
                              
                              
                                {platform.name}
                                {!platform.connected && (
                                  Not connected
                                )}
                              
                            
                             togglePlatform(platform.id)}
                              disabled={!platform.connected}
                              data-testid={`checkbox-platform-${platform.id}`}
                            />
                          
                        );
                      })}
                    
                  

                  
                    
                      Post Preview
                    
                    
                      
                        {content ? (
                          {content}
                        ) : (
                          Preview will appear here...
                        )}
                      
                    
                  
                
              
            

            
              
                
                  Post History
                  View and manage your social media posts
                
                
                  {posts && posts.length > 0 ? (
                    
                      {posts.slice(0, 10).map((post) => (
                        
                          
                            
                              {post.platform}
                              {post.status === "published" && (
                                Published
                              )}
                              {post.status === "draft" && (
                                Scheduled
                              )}
                            
                            {post.content}
                            
                              {post.publishedAt ? new Date(post.publishedAt).toLocaleString() : 
                               post.scheduledAt ? `Scheduled: ${new Date(post.scheduledAt).toLocaleString()}` : 
                               new Date(post.createdAt).toLocaleString()}
                            
                          
                          
                            
                          
                        
                      ))}
                    
                  ) : (
                    
                      
                      No posts yet
                    
                  )}
                
              
            

            
              
                
                  
                    Total Impressions
                  
                  
                    124.5K
                    +12% from last month
                  
                
                
                  
                    Engagement Rate
                  
                  
                    4.2%
                    +0.8% from last month
                  
                
                
                  
                    Total Posts
                  
                  
                    {posts?.length || 0}
                    Across all platforms
                  
                
              
            
          
        
      
    
  );
}