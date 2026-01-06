import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  RefreshCw, 
  Cloud, 
  Calendar, 
  FileText, 
  Newspaper, 
  Users, 
  Building, 
  Award,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Plus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Event, Resource, News, Speaker, Organizer, Sponsor } from "@shared/schema";
import { format } from "date-fns";
import { EventFormDialog } from "@/components/event-form-dialog";
import { ResourceFormDialog } from "@/components/resource-form-dialog";
import { NewsFormDialog } from "@/components/news-form-dialog";

interface SyncResult {
  success: boolean;
  speakers?: {
    created: number;
    updated: number;
    errors: number;
  };
  organizers?: {
    created: number;
    updated: number;
    errors: number;
  };
  sponsors?: {
    created: number;
    updated: number;
    errors: number;
  };
  errors?: string[];
}

export default function ResourcesCentre() {
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [createResourceOpen, setCreateResourceOpen] = useState(false);
  const [createNewsOpen, setCreateNewsOpen] = useState(false);

  const { data: events = [] } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: resources = [] } = useQuery<Resource[]>({
    queryKey: ["/api/resources"],
  });

  const { data: news = [] } = useQuery<News[]>({
    queryKey: ["/api/news"],
  });

  const { data: speakers = [] } = useQuery<Speaker[]>({
    queryKey: ["/api/speakers"],
  });

  const { data: organizers = [] } = useQuery<Organizer[]>({
    queryKey: ["/api/organizers"],
  });

  const { data: sponsors = [] } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
  });

  const syncMutation = useMutation<SyncResult, Error, void>({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/sync/resources-centre");
      return await response.json();
    },
    onSuccess: (data: SyncResult) => {
      setSyncResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/speakers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      
      if (data.success) {
        toast({
          title: "Sync completed successfully",
          description: "Reference data has been synced from Resources Centre.",
        });
      } else {
        toast({
          title: "Sync completed with errors",
          description: "Some items failed to sync. Check the results below.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error.message || "Failed to sync with Resources Centre",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSyncing(false);
    },
  });

  const handleSync = () => {
    setIsSyncing(true);
    setSyncResult(null);
    syncMutation.mutate();
  };

  const publishedEvents = events.filter(e => e.status === 'published');
  const publishedResources = resources.filter(r => r.status === 'published');
  const publishedNews = news.filter(n => n.status === 'published');

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Cloud className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Resources Centre</h1>
            <p className="text-muted-foreground">
              Manage content distribution and reference data sync
            </p>
          </div>
        </div>
      </div>

      {/* Sync Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Reference Data Sync</CardTitle>
              <CardDescription>
                Sync speakers, organizers, and sponsors from Resources Centre
              </CardDescription>
            </div>
            <Button 
              onClick={handleSync} 
              disabled={isSyncing}
              data-testid="button-sync-resources-centre"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {syncResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {syncResult.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                <span className="font-semibold">
                  {syncResult.success ? 'Sync Successful' : 'Sync Completed with Errors'}
                </span>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                {syncResult.speakers && (
                  <div className="p-3 rounded-lg border">
                    <div className="text-sm text-muted-foreground mb-1">Speakers</div>
                    <div className="text-sm">
                      <span className="text-green-600">+{syncResult.speakers.created}</span> created,{' '}
                      <span className="text-blue-600">{syncResult.speakers.updated}</span> updated
                      {syncResult.speakers.errors > 0 && (
                        <>, <span className="text-destructive">{syncResult.speakers.errors}</span> errors</>
                      )}
                    </div>
                  </div>
                )}
                
                {syncResult.organizers && (
                  <div className="p-3 rounded-lg border">
                    <div className="text-sm text-muted-foreground mb-1">Organizers</div>
                    <div className="text-sm">
                      <span className="text-green-600">+{syncResult.organizers.created}</span> created,{' '}
                      <span className="text-blue-600">{syncResult.organizers.updated}</span> updated
                      {syncResult.organizers.errors > 0 && (
                        <>, <span className="text-destructive">{syncResult.organizers.errors}</span> errors</>
                      )}
                    </div>
                  </div>
                )}
                
                {syncResult.sponsors && (
                  <div className="p-3 rounded-lg border">
                    <div className="text-sm text-muted-foreground mb-1">Sponsors</div>
                    <div className="text-sm">
                      <span className="text-green-600">+{syncResult.sponsors.created}</span> created,{' '}
                      <span className="text-blue-600">{syncResult.sponsors.updated}</span> updated
                      {syncResult.sponsors.errors > 0 && (
                        <>, <span className="text-destructive">{syncResult.sponsors.errors}</span> errors</>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {syncResult.errors && syncResult.errors.length > 0 && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="text-sm font-semibold text-destructive mb-2">Errors:</div>
                  <ul className="text-sm space-y-1">
                    {syncResult.errors.map((error, idx) => (
                      <li key={idx} className="text-destructive">{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!syncResult && (
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border hover-elevate">
                <div className="flex items-center justify-between mb-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="secondary">{speakers.length}</Badge>
                </div>
                <div className="font-semibold">Speakers</div>
                <div className="text-xs text-muted-foreground mt-1">Synced speakers</div>
              </div>

              <div className="p-4 rounded-lg border hover-elevate">
                <div className="flex items-center justify-between mb-2">
                  <Building className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="secondary">{organizers.length}</Badge>
                </div>
                <div className="font-semibold">Organizers</div>
                <div className="text-xs text-muted-foreground mt-1">Synced organizers</div>
              </div>

              <div className="p-4 rounded-lg border hover-elevate">
                <div className="flex items-center justify-between mb-2">
                  <Award className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="secondary">{sponsors.length}</Badge>
                </div>
                <div className="font-semibold">Sponsors</div>
                <div className="text-xs text-muted-foreground mt-1">Synced sponsors</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Content Management Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Content for Distribution</CardTitle>
          <CardDescription>
            Manage events, resources, and news articles to distribute to Resources Centre
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="events" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="events" data-testid="tab-events">
                <Calendar className="h-4 w-4 mr-2" />
                Events ({publishedEvents.length})
              </TabsTrigger>
              <TabsTrigger value="resources" data-testid="tab-resources">
                <FileText className="h-4 w-4 mr-2" />
                Resources ({publishedResources.length})
              </TabsTrigger>
              <TabsTrigger value="news" data-testid="tab-news">
                <Newspaper className="h-4 w-4 mr-2" />
                News ({publishedNews.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="events" className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {publishedEvents.length} published events ready for distribution
                </p>
                <Button size="sm" onClick={() => setCreateEventOpen(true)} data-testid="button-create-event">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Event
                </Button>
              </div>
              {publishedEvents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No published events yet</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {publishedEvents.slice(0, 5).map((event) => (
                    <div key={event.id} className="flex items-center justify-between p-3 rounded-lg border hover-elevate">
                      <div className="flex-1">
                        <div className="font-medium">{event.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {event.eventType} • {format(new Date(event.startIso), 'PPP')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{event.community}</Badge>
                        <Button size="sm" variant="ghost" asChild>
                          <a href={`/events/${event.id}`} target="_blank">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                  {publishedEvents.length > 5 && (
                    <Button variant="outline" size="sm" asChild>
                      <a href="/events">View all {publishedEvents.length} events</a>
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="resources" className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {publishedResources.length} published resources ready for distribution
                </p>
                <Button size="sm" onClick={() => setCreateResourceOpen(true)} data-testid="button-create-resource">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Resource
                </Button>
              </div>
              {publishedResources.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No published resources yet</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {publishedResources.slice(0, 5).map((resource) => (
                    <div key={resource.id} className="flex items-center justify-between p-3 rounded-lg border hover-elevate">
                      <div className="flex-1">
                        <div className="font-medium">{resource.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {resource.resourceType}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{resource.community}</Badge>
                        <Button size="sm" variant="ghost" asChild>
                          <a href={`/resources/${resource.id}`} target="_blank">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                  {publishedResources.length > 5 && (
                    <Button variant="outline" size="sm" asChild>
                      <a href="/resources">View all {publishedResources.length} resources</a>
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="news" className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {publishedNews.length} published news articles ready for distribution
                </p>
                <Button size="sm" onClick={() => setCreateNewsOpen(true)} data-testid="button-create-news">
                  <Plus className="h-4 w-4 mr-2" />
                  Create News
                </Button>
              </div>
              {publishedNews.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Newspaper className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No published news articles yet</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {publishedNews.slice(0, 5).map((newsItem) => (
                    <div key={newsItem.id} className="flex items-center justify-between p-3 rounded-lg border hover-elevate">
                      <div className="flex-1">
                        <div className="font-medium">{newsItem.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {newsItem.publishedIso && format(new Date(newsItem.publishedIso), 'PPP')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{newsItem.community}</Badge>
                        <Button size="sm" variant="ghost" asChild>
                          <a href={`/news/${newsItem.id}`} target="_blank">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                  {publishedNews.length > 5 && (
                    <Button variant="outline" size="sm" asChild>
                      <a href="/news">View all {publishedNews.length} news articles</a>
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Integration Status */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <div className="font-medium">Environment Configured</div>
                <div className="text-sm text-muted-foreground">
                  Resources Centre URL and API key are set
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border">
              <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <div className="font-medium">Manual Sync</div>
                <div className="text-sm text-muted-foreground">
                  Click "Sync Now" to update reference data
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialogs */}
      <EventFormDialog 
        open={createEventOpen} 
        onOpenChange={setCreateEventOpen} 
      />
      <ResourceFormDialog 
        open={createResourceOpen} 
        onOpenChange={setCreateResourceOpen} 
      />
      <NewsFormDialog 
        open={createNewsOpen} 
        onOpenChange={setCreateNewsOpen} 
      />
    </div>
  );
}
