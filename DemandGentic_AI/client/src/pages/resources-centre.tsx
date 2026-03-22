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
  const [syncResult, setSyncResult] = useState(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [createResourceOpen, setCreateResourceOpen] = useState(false);
  const [createNewsOpen, setCreateNewsOpen] = useState(false);

  const { data: events = [] } = useQuery({
    queryKey: ["/api/events"],
  });

  const { data: resources = [] } = useQuery({
    queryKey: ["/api/resources"],
  });

  const { data: news = [] } = useQuery({
    queryKey: ["/api/news"],
  });

  const { data: speakers = [] } = useQuery({
    queryKey: ["/api/speakers"],
  });

  const { data: organizers = [] } = useQuery({
    queryKey: ["/api/organizers"],
  });

  const { data: sponsors = [] } = useQuery({
    queryKey: ["/api/sponsors"],
  });

  const syncMutation = useMutation({
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
    
      {/* Header */}
      
        
          
          
            Resources Centre
            
              Manage content distribution and reference data sync
            
          
        
      

      {/* Sync Card */}
      
        
          
            
              Reference Data Sync
              
                Sync speakers, organizers, and sponsors from Resources Centre
              
            
            
              
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            
          
        
        
          {syncResult && (
            
              
                {syncResult.success ? (
                  
                ) : (
                  
                )}
                
                  {syncResult.success ? 'Sync Successful' : 'Sync Completed with Errors'}
                
              
              
              
                {syncResult.speakers && (
                  
                    Speakers
                    
                      +{syncResult.speakers.created} created,{' '}
                      {syncResult.speakers.updated} updated
                      {syncResult.speakers.errors > 0 && (
                        <>, {syncResult.speakers.errors} errors
                      )}
                    
                  
                )}
                
                {syncResult.organizers && (
                  
                    Organizers
                    
                      +{syncResult.organizers.created} created,{' '}
                      {syncResult.organizers.updated} updated
                      {syncResult.organizers.errors > 0 && (
                        <>, {syncResult.organizers.errors} errors
                      )}
                    
                  
                )}
                
                {syncResult.sponsors && (
                  
                    Sponsors
                    
                      +{syncResult.sponsors.created} created,{' '}
                      {syncResult.sponsors.updated} updated
                      {syncResult.sponsors.errors > 0 && (
                        <>, {syncResult.sponsors.errors} errors
                      )}
                    
                  
                )}
              

              {syncResult.errors && syncResult.errors.length > 0 && (
                
                  Errors:
                  
                    {syncResult.errors.map((error, idx) => (
                      {error}
                    ))}
                  
                
              )}
            
          )}

          {!syncResult && (
            
              
                
                  
                  {speakers.length}
                
                Speakers
                Synced speakers
              

              
                
                  
                  {organizers.length}
                
                Organizers
                Synced organizers
              

              
                
                  
                  {sponsors.length}
                
                Sponsors
                Synced sponsors
              
            
          )}
        
      

      {/* Content Management Tabs */}
      
        
          Content for Distribution
          
            Manage events, resources, and news articles to distribute to Resources Centre
          
        
        
          
            
              
                
                Events ({publishedEvents.length})
              
              
                
                Resources ({publishedResources.length})
              
              
                
                News ({publishedNews.length})
              
            

            
              
                
                  {publishedEvents.length} published events ready for distribution
                
                 setCreateEventOpen(true)} data-testid="button-create-event">
                  
                  Create Event
                
              
              {publishedEvents.length === 0 ? (
                
                  
                  No published events yet
                
              ) : (
                
                  {publishedEvents.slice(0, 5).map((event) => (
                    
                      
                        {event.title}
                        
                          {event.eventType} • {format(new Date(event.startIso), 'PPP')}
                        
                      
                      
                        {event.community}
                        
                          
                            
                          
                        
                      
                    
                  ))}
                  {publishedEvents.length > 5 && (
                    
                      View all {publishedEvents.length} events
                    
                  )}
                
              )}
            

            
              
                
                  {publishedResources.length} published resources ready for distribution
                
                 setCreateResourceOpen(true)} data-testid="button-create-resource">
                  
                  Create Resource
                
              
              {publishedResources.length === 0 ? (
                
                  
                  No published resources yet
                
              ) : (
                
                  {publishedResources.slice(0, 5).map((resource) => (
                    
                      
                        {resource.title}
                        
                          {resource.resourceType}
                        
                      
                      
                        {resource.community}
                        
                          
                            
                          
                        
                      
                    
                  ))}
                  {publishedResources.length > 5 && (
                    
                      View all {publishedResources.length} resources
                    
                  )}
                
              )}
            

            
              
                
                  {publishedNews.length} published news articles ready for distribution
                
                 setCreateNewsOpen(true)} data-testid="button-create-news">
                  
                  Create News
                
              
              {publishedNews.length === 0 ? (
                
                  
                  No published news articles yet
                
              ) : (
                
                  {publishedNews.slice(0, 5).map((newsItem) => (
                    
                      
                        {newsItem.title}
                        
                          {newsItem.publishedIso && format(new Date(newsItem.publishedIso), 'PPP')}
                        
                      
                      
                        {newsItem.community}
                        
                          
                            
                          
                        
                      
                    
                  ))}
                  {publishedNews.length > 5 && (
                    
                      View all {publishedNews.length} news articles
                    
                  )}
                
              )}
            
          
        
      

      {/* Integration Status */}
      
        
          Integration Status
        
        
          
            
              
              
                Environment Configured
                
                  Resources Centre URL and API key are set
                
              
            
            
              
              
                Manual Sync
                
                  Click "Sync Now" to update reference data
                
              
            
          
        
      

      {/* Create Dialogs */}
      
      
      
    
  );
}