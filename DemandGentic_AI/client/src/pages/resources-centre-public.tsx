import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Download,
  FileText,
  Lightbulb,
  Megaphone,
  Play,
  Search,
  Sparkles,
  Video,
  ExternalLink,
  Clock,
  User,
  Tag,
} from "lucide-react";
import type { Resource, News, Event } from "@shared/schema";
import { format } from "date-fns";

// Resource type icons and colors
const resourceTypeConfig: Record = {
  announcement: { icon: Megaphone, color: "text-amber-600", bgColor: "bg-amber-50" },
  insight: { icon: Lightbulb, color: "text-violet-600", bgColor: "bg-violet-50" },
  ebook: { icon: BookOpen, color: "text-blue-600", bgColor: "bg-blue-50" },
  solution_brief: { icon: FileText, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  webinar: { icon: Video, color: "text-rose-600", bgColor: "bg-rose-50" },
  whitepaper: { icon: FileText, color: "text-indigo-600", bgColor: "bg-indigo-50" },
  case_study: { icon: FileText, color: "text-cyan-600", bgColor: "bg-cyan-50" },
  report: { icon: FileText, color: "text-orange-600", bgColor: "bg-orange-50" },
};

export default function ResourcesCentrePublic() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // Fetch published resources
  const { data: resources = [], isLoading: resourcesLoading } = useQuery({
    queryKey: ["/api/resources"],
  });

  // Fetch published news (for announcements)
  const { data: news = [], isLoading: newsLoading } = useQuery({
    queryKey: ["/api/news"],
  });

  // Fetch upcoming events/webinars
  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["/api/events"],
  });

  // Fetch governed content from Creative Studio Resource Center
  const { data: governedContent = [] } = useQuery({
    queryKey: ["/api/content-governance/resource-center"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/content-governance/resource-center/public");
        if (!res.ok) return [];
        const data = await res.json();
        return data.resources || [];
      } catch { return []; }
    },
  });

  // Filter only published content
  const publishedResources = resources.filter((r) => r.status === "published");
  const publishedNews = news.filter((n) => n.status === "published");
  const publishedEvents = events.filter((e) => e.status === "published");

  // Map governed content to resource-like format for display
  const governedAsResources = governedContent.map((g: any) => ({
    id: g.id,
    title: g.title,
    description: g.metaDescription || "",
    resourceType: g.contentType === "ebook" ? "ebook" : g.contentType === "solution_brief" ? "solution_brief" : g.contentType === "blog_post" ? "insight" : "whitepaper",
    status: "published" as const,
    url: `/api/generative-studio/public/${g.slug}`,
    publishedAt: g.publishedAt,
    resourceCategory: g.resourceCategory,
    _governed: true,
  }));

  // Combine and categorize content
  const announcements = publishedNews;
  const insights = [
    ...publishedResources.filter((r) =>
      r.resourceType === "insight" || r.resourceType === "blog" || r.resourceType === "article"
    ),
    ...governedAsResources.filter((g: any) => g.resourceType === "insight"),
  ];
  const ebooks = [
    ...publishedResources.filter((r) => r.resourceType === "ebook"),
    ...governedAsResources.filter((g: any) => g.resourceType === "ebook"),
  ];
  const solutionBriefs = [
    ...publishedResources.filter((r) =>
      r.resourceType === "solution_brief" || r.resourceType === "whitepaper"
    ),
    ...governedAsResources.filter((g: any) => g.resourceType === "solution_brief" || g.resourceType === "whitepaper"),
  ];
  const webinars = publishedEvents.filter((e) =>
    e.eventType === "webinar" || e.eventType === "virtual"
  );

  // Search filter
  const filterBySearch = (items: T[]) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
    );
  };

  const filteredAnnouncements = filterBySearch(announcements);
  const filteredInsights = filterBySearch(insights);
  const filteredEbooks = filterBySearch(ebooks);
  const filteredSolutionBriefs = filterBySearch(solutionBriefs);
  const filteredWebinars = filterBySearch(webinars);

  const isLoading = resourcesLoading || newsLoading || eventsLoading;

  const ResourceCard = ({ resource }: { resource: Resource }) => {
    const config = resourceTypeConfig[resource.resourceType] || resourceTypeConfig.insight;
    const IconComponent = config.icon;

    return (
      
        
          
            
              
            
            
              {resource.resourceType.replace("_", " ")}
            
          
          
            {resource.title}
          
          {resource.description && (
            
              {resource.description}
            
          )}
          
            {resource.author && (
              
                
                {resource.author}
              
            )}
            {resource.createdAt && (
              
                
                {format(new Date(resource.createdAt), "MMM d, yyyy")}
              
            )}
          
          
            {resource.downloadUrl ? (
              <>
                
                Download
              
            ) : (
              <>
                
                Read More
              
            )}
          
        
      
    );
  };

  const AnnouncementCard = ({ item }: { item: News }) => (
    
      
        
          
            
          
          
            Announcement
          
        
        
          {item.title}
        
        {item.summary && (
          
            {item.summary}
          
        )}
        
          {item.publishedIso && (
            
              
              {format(new Date(item.publishedIso), "MMM d, yyyy")}
            
          )}
        
        
          
          Read More
        
      
    
  );

  const WebinarCard = ({ event }: { event: Event }) => (
    
      
        
          
            
          
          
            {event.eventType === "webinar" ? "Webinar" : "Virtual Event"}
          
        
        
          {event.title}
        
        {event.description && (
          
            {event.description}
          
        )}
        
          
            
            {format(new Date(event.startIso), "MMM d, yyyy 'at' h:mm a")}
          
        
        
          
          Register Now
        
      
    
  );

  const EmptyState = ({ type, icon: Icon }: { type: string; icon: React.ElementType }) => (
    
      
        
      
      No {type} Available
      
        Check back soon for new {type.toLowerCase()}. We're constantly adding valuable content for B2B professionals.
      
    
  );

  return (
    
      {/* Navigation */}
      
        
           setLocation("/")}>
            
              
                PB
                
              
            
            
              Pivotal B2B
              Resources Centre
            
          
          
            Home
            Platform
            Services
            About
          
          
             setLocation("/client-portal/login")}>
              Sign In
            
             setLocation("/book/admin/demo")} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
              Schedule Demo
              
            
          
        
      

      {/* Hero Section */}
      
        
        

        
          
            
              
              Resources Centre
            

            
              
                B2B Insights &
              
              
              
                Knowledge Hub
              
            

            
              Explore our collection of insights, eBooks, solution briefs, and webinars designed
              to help you master B2B demand generation and drive pipeline growth.
            

            {/* Search */}
            
              
               setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-lg border-2 focus:border-violet-500"
              />
            
          
        
      

      {/* Content Tabs */}
      
        
          
            
              
                All Resources
              
              
                
                Announcements ({filteredAnnouncements.length})
              
              
                
                Insights ({filteredInsights.length})
              
              
                
                eBooks ({filteredEbooks.length})
              
              
                
                Solution Briefs ({filteredSolutionBriefs.length})
              
              
                
                Webinars ({filteredWebinars.length})
              
            

            {isLoading ? (
              
                
              
            ) : (
              <>
                
                  {/* Featured Section */}
                  {filteredAnnouncements.length > 0 && (
                    
                      
                        
                        Latest Announcements
                      
                      
                        {filteredAnnouncements.slice(0, 3).map((item) => (
                          
                        ))}
                      
                    
                  )}

                  {filteredInsights.length > 0 && (
                    
                      
                        
                        Insights & Articles
                      
                      
                        {filteredInsights.slice(0, 3).map((resource) => (
                          
                        ))}
                      
                    
                  )}

                  {filteredEbooks.length > 0 && (
                    
                      
                        
                        eBooks & Guides
                      
                      
                        {filteredEbooks.slice(0, 3).map((resource) => (
                          
                        ))}
                      
                    
                  )}

                  {filteredSolutionBriefs.length > 0 && (
                    
                      
                        
                        Solution Briefs & Whitepapers
                      
                      
                        {filteredSolutionBriefs.slice(0, 3).map((resource) => (
                          
                        ))}
                      
                    
                  )}

                  {filteredWebinars.length > 0 && (
                    
                      
                        
                        Webinars & Virtual Events
                      
                      
                        {filteredWebinars.slice(0, 3).map((event) => (
                          
                        ))}
                      
                    
                  )}

                  {filteredAnnouncements.length === 0 &&
                   filteredInsights.length === 0 &&
                   filteredEbooks.length === 0 &&
                   filteredSolutionBriefs.length === 0 &&
                   filteredWebinars.length === 0 && (
                    
                  )}
                

                
                  
                    {filteredAnnouncements.length > 0 ? (
                      filteredAnnouncements.map((item) => (
                        
                      ))
                    ) : (
                      
                    )}
                  
                

                
                  
                    {filteredInsights.length > 0 ? (
                      filteredInsights.map((resource) => (
                        
                      ))
                    ) : (
                      
                    )}
                  
                

                
                  
                    {filteredEbooks.length > 0 ? (
                      filteredEbooks.map((resource) => (
                        
                      ))
                    ) : (
                      
                    )}
                  
                

                
                  
                    {filteredSolutionBriefs.length > 0 ? (
                      filteredSolutionBriefs.map((resource) => (
                        
                      ))
                    ) : (
                      
                    )}
                  
                

                
                  
                    {filteredWebinars.length > 0 ? (
                      filteredWebinars.map((event) => (
                        
                      ))
                    ) : (
                      
                    )}
                  
                
              
            )}
          
        
      

      {/* CTA Section */}
      
        
          
            Ready to Transform Your B2B Pipeline?
          
          
            Schedule a strategy call with our team to see how Pivotal B2B can help you
            generate more qualified leads with AI-powered demand generation.
          
          
             setLocation("/book/admin/demo")}>
              Schedule Strategy Call
              
            
             setLocation("/about")}>
              Learn About Us
            
          
        
      

      {/* Footer */}
      
        
          
            
              
                PB
              
              Pivotal B2B
            
            
              Privacy Policy
              Terms of Service
              GDPR
            
            
              © 2026 Pivotal B2B LLC. All rights reserved.
            
          
        
      
    
  );
}