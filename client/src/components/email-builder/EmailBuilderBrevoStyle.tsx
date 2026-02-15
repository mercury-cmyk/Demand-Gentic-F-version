import { useState, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { EmailCanvas } from "./EmailCanvas";
import { HtmlCodeEditor } from "./HtmlCodeEditor";
import { EmailPreview } from "./EmailPreview";
import { SimpleEmailCanvas } from "./SimpleEmailCanvas";
import {
  buildBrandedEmailHtml,
  EMAIL_TEMPLATES,
  BrandPaletteKey,
  type EmailTemplateCopy
} from "./ai-email-template";
import {
  Eye,
  Send,
  Sparkles,
  Copy,
  RotateCcw,
  ChevronRight,
  Mail,
  Type,
  Image as ImageIcon,
  Video,
  MoreHorizontal,
  Code2,
  Share2,
  Grid3x3,
  Minus as DividerIcon,
  Package,
  Link2,
  Zap
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
}

interface EmailBlock {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: "basic" | "media" | "social" | "ecommerce";
}

interface EmailBuilderBrevoStyleProps {
  initialSubject?: string;
  initialPreheader?: string;
  initialHtml?: string;
  initialDesign?: any;
  sampleContacts?: Contact[];
  senderProfileId?: string;
  onSave?: (data: {
    subject: string;
    preheader: string;
    htmlContent: string;
    design: any;
  }) => void;
  onSendTest?: (emails: string[]) => void;
}

// Email blocks library
const EMAIL_BLOCKS: EmailBlock[] = [
  { id: "title", name: "Title", icon: <Type className="w-4 h-4" />, category: "basic" },
  { id: "text", name: "Text", icon: <Type className="w-4 h-4" />, category: "basic" },
  { id: "image", name: "Image", icon: <ImageIcon className="w-4 h-4" />, category: "media" },
  { id: "video", name: "Video", icon: <Video className="w-4 h-4" />, category: "media" },
  { id: "button", name: "Button", icon: <MoreHorizontal className="w-4 h-4" />, category: "basic" },
  { id: "logo", name: "Logo", icon: <Package className="w-4 h-4" />, category: "basic" },
  { id: "social", name: "Social", icon: <Share2 className="w-4 h-4" />, category: "social" },
  { id: "html", name: "HTML", icon: <Code2 className="w-4 h-4" />, category: "basic" },
  { id: "payment", name: "Payment link", icon: <Link2 className="w-4 h-4" />, category: "ecommerce" },
  { id: "divider", name: "Divider", icon: <DividerIcon className="w-4 h-4" />, category: "basic" },
  { id: "product", name: "Product", icon: <Package className="w-4 h-4" />, category: "ecommerce" },
  { id: "navigation", name: "Navigation", icon: <Grid3x3 className="w-4 h-4" />, category: "basic" }
];

export function EmailBuilderBrevoStyle({
  initialSubject = "Your Email Subject",
  initialPreheader = "",
  initialHtml = "",
  initialDesign = null,
  sampleContacts = [],
  senderProfileId = "",
  onSave,
  onSendTest
}: EmailBuilderBrevoStyleProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [preheader, setPreheader] = useState(initialPreheader);
  const [htmlContent, setHtmlContent] = useState(initialHtml);
  const [design, setDesign] = useState(initialDesign);
  const [editorMode, setEditorMode] = useState<"simple" | "code">("simple");
  const [showPreview, setShowPreview] = useState(false);
  const [testEmails, setTestEmails] = useState("");

  // Left sidebar state
  const [sidebarTab, setSidebarTab] = useState<"blocks" | "sections" | "saved">("blocks");

  // AI features
  const [selectedTemplate, setSelectedTemplate] = useState<string>("welcome");
  const [selectedBrand, setSelectedBrand] = useState<BrandPaletteKey>("indigo");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Detect template type from prompt
  const detectTemplateType = (prompt: string): string => {
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes("webinar")) return "webinar";
    if (lowerPrompt.includes("whitepaper")) return "whitepaper";
    if (lowerPrompt.includes("ebook") || lowerPrompt.includes("e-book")) return "ebook";
    if (lowerPrompt.includes("infographic")) return "infographic";
    if (lowerPrompt.includes("case study") || lowerPrompt.includes("casestudy")) return "casestudy";
    if (lowerPrompt.includes("event") || lowerPrompt.includes("conference")) return "event";
    if (lowerPrompt.includes("survey") || lowerPrompt.includes("poll")) return "survey";
    if (lowerPrompt.includes("feedback") || lowerPrompt.includes("review")) return "feedback";
    if (lowerPrompt.includes("newsletter")) return "newsletter";
    if (lowerPrompt.includes("welcome")) return "welcome";
    if (lowerPrompt.includes("promotion") || lowerPrompt.includes("discount") || lowerPrompt.includes("offer")) return "promotion";
    if (lowerPrompt.includes("announcement") || lowerPrompt.includes("announce")) return "announcement";
    
    return "welcome"; // Default template
  };

  // Enhance prompt content based on template type
  const enhancePromptContent = (prompt: string, templateType: string): EmailTemplateCopy => {
    const template = EMAIL_TEMPLATES[templateType as keyof typeof EMAIL_TEMPLATES];
    if (!template) return template || EMAIL_TEMPLATES.welcome;

    // Extract specific keywords from prompt
    const companyMatch = prompt.match(/(?:for|from|about)\s+([A-Z][a-z\s]+?)(?:\s+to|\s+and|,|$)/);
    const companyName = companyMatch?.[1]?.trim() || "Your Company";
    
    // Store detected company name for reference/branding
    const context = { companyName };

    return {
      ...template,
      // Keep template's optimized subject if user didn't specify
      subject: template.subject,
      preheader: template.preheader,
      heroTitle: template.heroTitle,
      heroSubtitle: template.heroSubtitle,
      intro: template.intro,
      valueBullets: template.valueBullets,
      ctaLabel: template.ctaLabel,
      ctaUrl: template.ctaUrl,
      closingLine: template.closingLine
    };
  };

  const handleEmailCanvasChange = (html: string, designData: any) => {
    setHtmlContent(html);
    setDesign(designData);
  };

  const handleHtmlCodeChange = (code: string) => {
    setHtmlContent(code);
  };

  const handleSave = () => {
    onSave?.({
      subject,
      preheader,
      htmlContent,
      design
    });
  };

  const handleSendTest = () => {
    if (testEmails.trim()) {
      const emails = testEmails
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e);
      onSendTest?.(emails);
      setTestEmails("");
    }
  };

  const generateFromTemplate = () => {
    const template = EMAIL_TEMPLATES[selectedTemplate as keyof typeof EMAIL_TEMPLATES];
    if (!template) return;

    const copy: EmailTemplateCopy = {
      ...template,
      subject: subject || template.subject,
      preheader: preheader || template.preheader,
    };

    const html = buildBrandedEmailHtml({
      copy,
      brandPalette: selectedBrand,
      includeFooter: true
    });

    setHtmlContent(html);
    setSubject(copy.subject);
    setPreheader(copy.preheader || "");
  };

  const generateFromPrompt = async () => {
    if (!aiPrompt.trim()) return;

    setIsGenerating(true);
    
    // Extract company name for branding consistency
    const companyMatch = aiPrompt.match(/(?:for|from|about)\s+([A-Z][a-z\s]+?)(?:\s+to|\s+and|,|$)/);
    const companyName = companyMatch?.[1]?.trim() || "Your Company";

    try {
      // Try DeepSeek AI first for real content generation
      const response = await fetch('/api/email-ai/deepseek/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({
          prompt: aiPrompt,
          tone: 'professional',
          templateType: detectTemplateType(aiPrompt),
          companyName,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.content) {
          // Build HTML with AI-generated content
          const html = buildBrandedEmailHtml({
            copy: {
              ...data.content,
            },
            brandPalette: selectedBrand,
            // Prefer API-returned company name (from DB intelligence) over regex match
            companyName: data.content.companyName || companyName,
            includeFooter: true
          });

          setHtmlContent(html);
          setSubject(data.content.subject);
          setPreheader(data.content.preheader || "");
          setAiPrompt("");
          return;
        }
      }
      
      // Fallback to local template-based generation
      const detectedTemplate = detectTemplateType(aiPrompt);
      setSelectedTemplate(detectedTemplate);
      const enhancedCopy = enhancePromptContent(aiPrompt, detectedTemplate);

      const html = buildBrandedEmailHtml({
        copy: enhancedCopy,
        brandPalette: selectedBrand,
        includeFooter: true
      });

      setHtmlContent(html);
      setSubject(enhancedCopy.subject);
      setPreheader(enhancedCopy.preheader || '');
    } catch (error) {
      console.error('AI generation error:', error);
      // Fallback to local template
      const detectedTemplate = detectTemplateType(aiPrompt);
      const enhancedCopy = enhancePromptContent(aiPrompt, detectedTemplate);
      const html = buildBrandedEmailHtml({
        copy: enhancedCopy,
        brandPalette: selectedBrand,
        includeFooter: true
      });
      setHtmlContent(html);
      setSubject(enhancedCopy.subject);
      setPreheader(enhancedCopy.preheader || '');
    } finally {
      setIsGenerating(false);
      setAiPrompt("");
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(htmlContent);
  };

  const resetBuilder = () => {
    setSubject(initialSubject);
    setPreheader(initialPreheader);
    setHtmlContent(initialHtml);
    setDesign(initialDesign);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Top Header */}
      <div className="border-b bg-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded flex items-center justify-center text-white text-sm font-bold">
            B
          </div>
          <div>
            <h2 className="text-sm font-semibold">Email Template Editor</h2>
            <p className="text-xs text-muted-foreground">Brevo-style Builder</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="w-4 h-4 mr-1" />
            Preview & test
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save & quit
          </Button>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Left Sidebar - Blocks, Sections, Saved */}
        <div className="w-64 border-r bg-white flex flex-col">
          {/* Sidebar Tabs */}
          <div className="border-b">
            <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-3 rounded-none border-b bg-transparent p-1">
                <TabsTrigger value="blocks" className="text-xs rounded-none">
                  Blocks
                </TabsTrigger>
                <TabsTrigger value="sections" className="text-xs rounded-none">
                  Sections
                </TabsTrigger>
                <TabsTrigger value="saved" className="text-xs rounded-none">
                  Saved
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              {/* Blocks Tab */}
              {sidebarTab === "blocks" && (
                <div className="space-y-4">
                  {/* Brevo Aura AI */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-900">Aura AI</span>
                    </div>
                    <p className="text-xs text-blue-700">Smart template generator for:</p>
                    <div className="text-xs text-blue-600 space-y-1">
                      <div>✓ Webinars, Whitepapers, eBooks</div>
                      <div>✓ Infographics, Case Studies</div>
                      <div>✓ Events, Surveys, Feedback</div>
                      <div>✓ Promos, Newsletters, Announcements</div>
                    </div>
                    <Textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="E.g., 'Webinar invitation for cloud migration' or 'Whitepaper download email'..."
                      className="text-xs resize-none h-16 bg-white"
                    />
                    <Button
                      onClick={generateFromPrompt}
                      disabled={isGenerating || !aiPrompt.trim()}
                      className="w-full text-xs bg-blue-600 hover:bg-blue-700"
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      {isGenerating ? "Generating..." : "Generate Email"}
                    </Button>
                  </div>

                  <Separator />

                  {/* Content Blocks Grid */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700">Content</p>
                    <div className="grid grid-cols-3 gap-2">
                      {EMAIL_BLOCKS.filter(b => b.category === "basic").map(block => (
                        <div
                          key={block.id}
                          className="flex flex-col items-center justify-center p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition"
                          draggable
                        >
                          <div className="text-gray-600 mb-1">{block.icon}</div>
                          <p className="text-xs text-center text-gray-700 font-medium">{block.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Media Blocks */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700">Media</p>
                    <div className="grid grid-cols-3 gap-2">
                      {EMAIL_BLOCKS.filter(b => b.category === "media").map(block => (
                        <div
                          key={block.id}
                          className="flex flex-col items-center justify-center p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition"
                          draggable
                        >
                          <div className="text-gray-600 mb-1">{block.icon}</div>
                          <p className="text-xs text-center text-gray-700 font-medium">{block.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Ecommerce Blocks */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700">Ecommerce</p>
                    <div className="grid grid-cols-3 gap-2">
                      {EMAIL_BLOCKS.filter(b => b.category === "ecommerce").map(block => (
                        <div
                          key={block.id}
                          className="flex flex-col items-center justify-center p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition"
                          draggable
                        >
                          <div className="text-gray-600 mb-1">{block.icon}</div>
                          <p className="text-xs text-center text-gray-700 font-medium">{block.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Sections Tab */}
              {sidebarTab === "sections" && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Pre-built sections coming soon</p>
                </div>
              )}

              {/* Saved Tab */}
              {sidebarTab === "saved" && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Your saved templates will appear here</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Center - Canvas Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Canvas Header - Subject & Preheader */}
          <div className="border-b bg-gray-50 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold mb-1 block">Subject line</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject..."
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold mb-1 block">Preview text</Label>
                <Input
                  value={preheader}
                  onChange={(e) => setPreheader(e.target.value)}
                  placeholder="Preview text..."
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          {/* Builder Canvas */}
          <div className="flex-1 min-h-0 bg-gray-100 p-4 overflow-auto">
            <div className="max-w-2xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden h-full border">
              {editorMode === "simple" && (
                <SimpleEmailCanvas
                  initialHtml={htmlContent}
                  onChange={handleHtmlCodeChange}
                />
              )}
              {editorMode === "code" && (
                <HtmlCodeEditor
                  value={htmlContent}
                  onChange={handleHtmlCodeChange}
                  onPreview={() => setShowPreview(true)}
                  height="100%"
                />
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div className="border-t bg-white p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold">Mode:</Label>
              <div className="flex gap-1 border rounded-lg p-1">
                <Button
                  variant={editorMode === "simple" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setEditorMode("simple")}
                  className="text-xs"
                >
                  Simple
                </Button>
                <Button
                  variant={editorMode === "code" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setEditorMode("code")}
                  className="text-xs"
                >
                  Code
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={copyToClipboard}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                <Copy className="w-3 h-3 mr-1" />
                Copy
              </Button>
              <Button
                onClick={resetBuilder}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Settings & AI */}
        <div className="w-56 border-l bg-white flex flex-col">
          <div className="border-b p-4 space-y-3">
            <div>
              <Label className="text-xs font-semibold mb-2 block">Brand Color</Label>
              <Select value={selectedBrand} onValueChange={(v) => setSelectedBrand(v as BrandPaletteKey)}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="indigo">Indigo</SelectItem>
                  <SelectItem value="emerald">Emerald</SelectItem>
                  <SelectItem value="slate">Slate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div>
              <Label className="text-xs font-semibold mb-2 block">Test Email</Label>
              <div className="flex gap-1">
                <Input
                  value={testEmails}
                  onChange={(e) => setTestEmails(e.target.value)}
                  placeholder="test@example.com"
                  className="text-xs"
                />
                <Button
                  onClick={handleSendTest}
                  size="sm"
                  disabled={!testEmails.trim() || !senderProfileId}
                  className="text-xs"
                >
                  <Send className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold">Templates</p>
                {Object.entries(EMAIL_TEMPLATES).map(([key, template]) => (
                  <Button
                    key={key}
                    variant={selectedTemplate === key ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTemplate(key as any)}
                    className="w-full justify-start text-xs h-auto py-2"
                  >
                    <Sparkles className="w-3 h-3 mr-2" />
                    <div className="text-left">
                      <div className="capitalize font-medium">{key}</div>
                      <div className="text-xs opacity-70">{template.subject}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <EmailPreview
          open={showPreview}
          onOpenChange={setShowPreview}
          htmlContent={htmlContent}
          subject={subject}
          preheader={preheader}
          fromName="Sender"
          fromEmail="sender@example.com"
          sampleContacts={sampleContacts}
        />
      )}
    </div>
  );
}
