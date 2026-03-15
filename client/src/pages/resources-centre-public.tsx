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
const resourceTypeConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
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
  const { data: resources = [], isLoading: resourcesLoading } = useQuery<Resource[]>({
    queryKey: ["/api/resources"],
  });

  // Fetch published news (for announcements)
  const { data: news = [], isLoading: newsLoading } = useQuery<News[]>({
    queryKey: ["/api/news"],
  });

  // Fetch upcoming events/webinars
  const { data: events = [], isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  // Fetch governed content from Creative Studio Resource Center
  const { data: governedContent = [] } = useQuery<any[]>({
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
  const filterBySearch = <T extends { title: string; description?: string | null }>(items: T[]) => {
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
      <Card className="h-full hover:shadow-lg transition-all hover:-translate-y-1 border-2 group">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className={`h-12 w-12 rounded-xl ${config.bgColor} flex items-center justify-center`}>
              <IconComponent className={`h-6 w-6 ${config.color}`} />
            </div>
            <Badge variant="outline" className="text-xs">
              {resource.resourceType.replace("_", " ")}
            </Badge>
          </div>
          <h3 className="font-bold text-lg mb-2 group-hover:text-violet-600 transition-colors line-clamp-2">
            {resource.title}
          </h3>
          {resource.description && (
            <p className="text-muted-foreground text-sm mb-4 line-clamp-3">
              {resource.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
            {resource.author && (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>{resource.author}</span>
              </div>
            )}
            {resource.createdAt && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{format(new Date(resource.createdAt), "MMM d, yyyy")}</span>
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" className="w-full group-hover:bg-violet-50 group-hover:border-violet-200">
            {resource.downloadUrl ? (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4 mr-2" />
                Read More
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  };

  const AnnouncementCard = ({ item }: { item: News }) => (
    <Card className="h-full hover:shadow-lg transition-all hover:-translate-y-1 border-2 group">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center">
            <Megaphone className="h-6 w-6 text-amber-600" />
          </div>
          <Badge className="bg-amber-100 text-amber-700 border-none">
            Announcement
          </Badge>
        </div>
        <h3 className="font-bold text-lg mb-2 group-hover:text-violet-600 transition-colors line-clamp-2">
          {item.title}
        </h3>
        {item.summary && (
          <p className="text-muted-foreground text-sm mb-4 line-clamp-3">
            {item.summary}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
          {item.publishedIso && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{format(new Date(item.publishedIso), "MMM d, yyyy")}</span>
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" className="w-full group-hover:bg-amber-50 group-hover:border-amber-200">
          <ArrowRight className="h-4 w-4 mr-2" />
          Read More
        </Button>
      </CardContent>
    </Card>
  );

  const WebinarCard = ({ event }: { event: Event }) => (
    <Card className="h-full hover:shadow-lg transition-all hover:-translate-y-1 border-2 group">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="h-12 w-12 rounded-xl bg-rose-50 flex items-center justify-center">
            <Video className="h-6 w-6 text-rose-600" />
          </div>
          <Badge className="bg-rose-100 text-rose-700 border-none">
            {event.eventType === "webinar" ? "Webinar" : "Virtual Event"}
          </Badge>
        </div>
        <h3 className="font-bold text-lg mb-2 group-hover:text-violet-600 transition-colors line-clamp-2">
          {event.title}
        </h3>
        {event.description && (
          <p className="text-muted-foreground text-sm mb-4 line-clamp-3">
            {event.description}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{format(new Date(event.startIso), "MMM d, yyyy 'at' h:mm a")}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full group-hover:bg-rose-50 group-hover:border-rose-200">
          <Play className="h-4 w-4 mr-2" />
          Register Now
        </Button>
      </CardContent>
    </Card>
  );

  const EmptyState = ({ type, icon: Icon }: { type: string; icon: React.ElementType }) => (
    <div className="text-center py-16 col-span-full">
      <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
        <Icon className="h-8 w-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-600 mb-2">No {type} Available</h3>
      <p className="text-muted-foreground text-sm max-w-md mx-auto">
        Check back soon for new {type.toLowerCase()}. We're constantly adding valuable content for B2B professionals.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setLocation("/")}>
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/5 border border-violet-500/10 shrink-0">
              <div className="relative flex items-center justify-center">
                <span className="font-bold text-sm text-violet-700 tracking-tighter">PB</span>
                <Sparkles className="h-2 w-2 text-blue-500 absolute -top-1 -right-1.5" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg leading-tight">Pivotal B2B</span>
              <span className="text-[10px] text-muted-foreground font-medium">Resources Centre</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Home</a>
            <a href="/#platform" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Platform</a>
            <a href="/#services" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Services</a>
            <a href="/about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">About</a>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation("/client-portal/login")}>
              Sign In
            </Button>
            <Button onClick={() => setLocation("/book/admin/demo")} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
              Schedule Demo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-50 via-background to-blue-50" />
        <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-gradient-to-br from-violet-500/10 to-indigo-500/10 rounded-full blur-3xl" />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center max-w-3xl mx-auto">
            <Badge className="mb-6 px-4 py-2 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 text-violet-700 border-violet-200/50">
              <BookOpen className="h-3.5 w-3.5 mr-2" />
              Resources Centre
            </Badge>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              <span className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent">
                B2B Insights &
              </span>
              <br />
              <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
                Knowledge Hub
              </span>
            </h1>

            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Explore our collection of insights, eBooks, solution briefs, and webinars designed
              to help you master B2B demand generation and drive pipeline growth.
            </p>

            {/* Search */}
            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-lg border-2 focus:border-violet-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Content Tabs */}
      <section className="py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start mb-8 bg-slate-100 p-1.5 rounded-xl flex-wrap h-auto gap-1">
              <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">
                All Resources
              </TabsTrigger>
              <TabsTrigger value="announcements" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">
                <Megaphone className="h-4 w-4 mr-2" />
                Announcements ({filteredAnnouncements.length})
              </TabsTrigger>
              <TabsTrigger value="insights" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">
                <Lightbulb className="h-4 w-4 mr-2" />
                Insights ({filteredInsights.length})
              </TabsTrigger>
              <TabsTrigger value="ebooks" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">
                <BookOpen className="h-4 w-4 mr-2" />
                eBooks ({filteredEbooks.length})
              </TabsTrigger>
              <TabsTrigger value="briefs" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">
                <FileText className="h-4 w-4 mr-2" />
                Solution Briefs ({filteredSolutionBriefs.length})
              </TabsTrigger>
              <TabsTrigger value="webinars" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">
                <Video className="h-4 w-4 mr-2" />
                Webinars ({filteredWebinars.length})
              </TabsTrigger>
            </TabsList>

            {isLoading ? (
              <div className="flex items-center justify-center py-24">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
              </div>
            ) : (
              <>
                <TabsContent value="all" className="space-y-12">
                  {/* Featured Section */}
                  {filteredAnnouncements.length > 0 && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Megaphone className="h-6 w-6 text-amber-600" />
                        Latest Announcements
                      </h2>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredAnnouncements.slice(0, 3).map((item) => (
                          <AnnouncementCard key={item.id} item={item} />
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredInsights.length > 0 && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Lightbulb className="h-6 w-6 text-violet-600" />
                        Insights & Articles
                      </h2>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredInsights.slice(0, 3).map((resource) => (
                          <ResourceCard key={resource.id} resource={resource} />
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredEbooks.length > 0 && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <BookOpen className="h-6 w-6 text-blue-600" />
                        eBooks & Guides
                      </h2>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredEbooks.slice(0, 3).map((resource) => (
                          <ResourceCard key={resource.id} resource={resource} />
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredSolutionBriefs.length > 0 && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <FileText className="h-6 w-6 text-emerald-600" />
                        Solution Briefs & Whitepapers
                      </h2>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredSolutionBriefs.slice(0, 3).map((resource) => (
                          <ResourceCard key={resource.id} resource={resource} />
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredWebinars.length > 0 && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Video className="h-6 w-6 text-rose-600" />
                        Webinars & Virtual Events
                      </h2>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredWebinars.slice(0, 3).map((event) => (
                          <WebinarCard key={event.id} event={event} />
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredAnnouncements.length === 0 &&
                   filteredInsights.length === 0 &&
                   filteredEbooks.length === 0 &&
                   filteredSolutionBriefs.length === 0 &&
                   filteredWebinars.length === 0 && (
                    <EmptyState type="Resources" icon={BookOpen} />
                  )}
                </TabsContent>

                <TabsContent value="announcements">
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAnnouncements.length > 0 ? (
                      filteredAnnouncements.map((item) => (
                        <AnnouncementCard key={item.id} item={item} />
                      ))
                    ) : (
                      <EmptyState type="Announcements" icon={Megaphone} />
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="insights">
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredInsights.length > 0 ? (
                      filteredInsights.map((resource) => (
                        <ResourceCard key={resource.id} resource={resource} />
                      ))
                    ) : (
                      <EmptyState type="Insights" icon={Lightbulb} />
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="ebooks">
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredEbooks.length > 0 ? (
                      filteredEbooks.map((resource) => (
                        <ResourceCard key={resource.id} resource={resource} />
                      ))
                    ) : (
                      <EmptyState type="eBooks" icon={BookOpen} />
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="briefs">
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredSolutionBriefs.length > 0 ? (
                      filteredSolutionBriefs.map((resource) => (
                        <ResourceCard key={resource.id} resource={resource} />
                      ))
                    ) : (
                      <EmptyState type="Solution Briefs" icon={FileText} />
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="webinars">
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredWebinars.length > 0 ? (
                      filteredWebinars.map((event) => (
                        <WebinarCard key={event.id} event={event} />
                      ))
                    ) : (
                      <EmptyState type="Webinars" icon={Video} />
                    )}
                  </div>
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-6 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Transform Your B2B Pipeline?
          </h2>
          <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
            Schedule a strategy call with our team to see how Pivotal B2B can help you
            generate more qualified leads with AI-powered demand generation.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-violet-700 hover:bg-white/90" onClick={() => setLocation("/book/admin/demo")}>
              Schedule Strategy Call
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="border-2 border-white/30 text-white hover:bg-white/10" onClick={() => setLocation("/about")}>
              Learn About Us
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 border border-white/20">
                <span className="font-bold text-sm text-white tracking-tighter">PB</span>
              </div>
              <span className="font-bold">Pivotal B2B</span>
            </div>
            <div className="flex gap-6 text-slate-400 text-sm">
              <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="/gdpr" className="hover:text-white transition-colors">GDPR</a>
            </div>
            <p className="text-slate-500 text-sm">
              © 2026 Pivotal B2B LLC. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
