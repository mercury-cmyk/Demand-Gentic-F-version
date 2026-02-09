import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Image,
  Globe,
  Mail,
  MessageSquare,
  FileText,
  BookOpen,
  Briefcase,
  History,
  Sparkles,
} from "lucide-react";
import ImageGenerationTab from "@/components/generative-studio/image-generation-tab";
import LandingPageTab from "@/components/generative-studio/landing-page-tab";
import EmailTemplateTab from "@/components/generative-studio/email-template-tab";
import ChatTab from "@/components/generative-studio/chat-tab";
import BlogPostTab from "@/components/generative-studio/blog-post-tab";
import EbookTab from "@/components/generative-studio/ebook-tab";
import SolutionBriefTab from "@/components/generative-studio/solution-brief-tab";
import ProjectHistoryPanel from "@/components/generative-studio/shared/project-history-panel";

export default function GenerativeStudioPage() {
  const [activeTab, setActiveTab] = useState("image");
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: brandKitsData } = useQuery<{ brandKits?: any[] }>({
    queryKey: ["/api/email-builder/brand-kits"],
  });

  const brandKits = brandKitsData?.brandKits || (Array.isArray(brandKitsData) ? brandKitsData : []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Generative Studio</h1>
            <p className="text-sm text-muted-foreground">
              AI-powered content creation hub for images, pages, emails, blogs, and more
            </p>
          </div>
        </div>
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <History className="w-4 h-4 mr-2" />
              History
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px]">
            <ProjectHistoryPanel />
          </SheetContent>
        </Sheet>
      </div>

      {/* Tabbed Content */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="border-b px-6">
          <TabsList className="h-11 bg-transparent gap-1">
            <TabsTrigger value="image" className="gap-1.5 data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700">
              <Image className="w-4 h-4" /> Images
            </TabsTrigger>
            <TabsTrigger value="landing-page" className="gap-1.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              <Globe className="w-4 h-4" /> Landing Pages
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-1.5 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700">
              <Mail className="w-4 h-4" /> Email Templates
            </TabsTrigger>
            <TabsTrigger value="blog" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
              <FileText className="w-4 h-4" /> Blog Posts
            </TabsTrigger>
            <TabsTrigger value="ebook" className="gap-1.5 data-[state=active]:bg-rose-50 data-[state=active]:text-rose-700">
              <BookOpen className="w-4 h-4" /> eBooks
            </TabsTrigger>
            <TabsTrigger value="solution-brief" className="gap-1.5 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
              <Briefcase className="w-4 h-4" /> Solution Briefs
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-1.5 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700">
              <MessageSquare className="w-4 h-4" /> Chat
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto">
          <TabsContent value="image" className="h-full mt-0 p-0">
            <ImageGenerationTab brandKits={brandKits} />
          </TabsContent>
          <TabsContent value="landing-page" className="h-full mt-0 p-0">
            <LandingPageTab brandKits={brandKits} />
          </TabsContent>
          <TabsContent value="email" className="h-full mt-0 p-0">
            <EmailTemplateTab brandKits={brandKits} />
          </TabsContent>
          <TabsContent value="blog" className="h-full mt-0 p-0">
            <BlogPostTab brandKits={brandKits} />
          </TabsContent>
          <TabsContent value="ebook" className="h-full mt-0 p-0">
            <EbookTab brandKits={brandKits} />
          </TabsContent>
          <TabsContent value="solution-brief" className="h-full mt-0 p-0">
            <SolutionBriefTab brandKits={brandKits} />
          </TabsContent>
          <TabsContent value="chat" className="h-full mt-0 p-0">
            <ChatTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
