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
  { id: "title", name: "Title", icon: , category: "basic" },
  { id: "text", name: "Text", icon: , category: "basic" },
  { id: "image", name: "Image", icon: , category: "media" },
  { id: "video", name: "Video", icon: , category: "media" },
  { id: "button", name: "Button", icon: , category: "basic" },
  { id: "logo", name: "Logo", icon: , category: "basic" },
  { id: "social", name: "Social", icon: , category: "social" },
  { id: "html", name: "HTML", icon: , category: "basic" },
  { id: "payment", name: "Payment link", icon: , category: "ecommerce" },
  { id: "divider", name: "Divider", icon: , category: "basic" },
  { id: "product", name: "Product", icon: , category: "ecommerce" },
  { id: "navigation", name: "Navigation", icon: , category: "basic" }
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
  const [editorMode, setEditorMode] = useState("simple");
  const [showPreview, setShowPreview] = useState(false);
  const [testEmails, setTestEmails] = useState("");

  // Left sidebar state
  const [sidebarTab, setSidebarTab] = useState("blocks");

  // AI features
  const [selectedTemplate, setSelectedTemplate] = useState("welcome");
  const [selectedBrand, setSelectedBrand] = useState("indigo");
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
    
      {/* Top Header */}
      
        
          
            B
          
          
            Email Template Editor
            Brevo-style Builder
          
        
        
           setShowPreview(true)}>
            
            Preview & test
          
          
            Save & quit
          
          
            
          
        
      

      {/* Main Layout */}
      
        {/* Left Sidebar - Blocks, Sections, Saved */}
        
          {/* Sidebar Tabs */}
          
             setSidebarTab(v as any)} className="w-full">
              
                
                  Blocks
                
                
                  Sections
                
                
                  Saved
                
              
            
          

          
            
              {/* Blocks Tab */}
              {sidebarTab === "blocks" && (
                
                  {/* Brevo Aura AI */}
                  
                    
                      
                      Aura AI
                    
                    Smart template generator for:
                    
                      ✓ Webinars, Whitepapers, eBooks
                      ✓ Infographics, Case Studies
                      ✓ Events, Surveys, Feedback
                      ✓ Promos, Newsletters, Announcements
                    
                     setAiPrompt(e.target.value)}
                      placeholder="E.g., 'Webinar invitation for cloud migration' or 'Whitepaper download email'..."
                      className="text-xs resize-none h-16 bg-white"
                    />
                    
                      
                      {isGenerating ? "Generating..." : "Generate Email"}
                    
                  

                  

                  {/* Content Blocks Grid */}
                  
                    Content
                    
                      {EMAIL_BLOCKS.filter(b => b.category === "basic").map(block => (
                        
                          {block.icon}
                          {block.name}
                        
                      ))}
                    
                  

                  

                  {/* Media Blocks */}
                  
                    Media
                    
                      {EMAIL_BLOCKS.filter(b => b.category === "media").map(block => (
                        
                          {block.icon}
                          {block.name}
                        
                      ))}
                    
                  

                  

                  {/* Ecommerce Blocks */}
                  
                    Ecommerce
                    
                      {EMAIL_BLOCKS.filter(b => b.category === "ecommerce").map(block => (
                        
                          {block.icon}
                          {block.name}
                        
                      ))}
                    
                  
                
              )}

              {/* Sections Tab */}
              {sidebarTab === "sections" && (
                
                  Pre-built sections coming soon
                
              )}

              {/* Saved Tab */}
              {sidebarTab === "saved" && (
                
                  Your saved templates will appear here
                
              )}
            
          
        

        {/* Center - Canvas Area */}
        
          {/* Canvas Header - Subject & Preheader */}
          
            
              
                Subject line
                 setSubject(e.target.value)}
                  placeholder="Email subject..."
                  className="text-sm"
                />
              
              
                Preview text
                 setPreheader(e.target.value)}
                  placeholder="Preview text..."
                  className="text-sm"
                />
              
            
          

          {/* Builder Canvas */}
          
            
              {editorMode === "simple" && (
                
              )}
              {editorMode === "code" && (
                 setShowPreview(true)}
                  height="100%"
                />
              )}
            
          

          {/* Action Bar */}
          
            
              Mode:
              
                 setEditorMode("simple")}
                  className="text-xs"
                >
                  Simple
                
                 setEditorMode("code")}
                  className="text-xs"
                >
                  Code
                
              
            

            
              
                
                Copy
              
              
                
                Reset
              
            
          
        

        {/* Right Sidebar - Settings & AI */}
        
          
            
              Brand Color
               setSelectedBrand(v as BrandPaletteKey)}>
                
                  
                
                
                  Indigo
                  Emerald
                  Slate
                
              
            

            

            
              Test Email
              
                 setTestEmails(e.target.value)}
                  placeholder="test@example.com"
                  className="text-xs"
                />
                
                  
                
              
            
          

          
            
              
                Templates
                {Object.entries(EMAIL_TEMPLATES).map(([key, template]) => (
                   setSelectedTemplate(key as any)}
                    className="w-full justify-start text-xs h-auto py-2"
                  >
                    
                    
                      {key}
                      {template.subject}
                    
                  
                ))}
              
            
          
        
      

      {/* Preview Modal */}
      {showPreview && (
        
      )}
    
  );
}