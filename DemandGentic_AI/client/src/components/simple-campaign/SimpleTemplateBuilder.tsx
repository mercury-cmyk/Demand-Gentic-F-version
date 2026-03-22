/**
 * SimpleTemplateBuilder - Page 2 of Simple Campaign Builder
 * 
 * Full-screen email editor with:
 * - Left/Main Area (70%): Email Canvas at 600px, text-first
 * - Right Sidebar: Components (drag & drop) + AgentX
 * - Top Bar: Preview, Save, Send Test, Back to Campaign
 * 
 * Design Philosophy:
 * - Text-first, deliverability-focused
 * - Gmail/Outlook first rendering  
 * - No auto-logos, no image-heavy headers
 * - ESP-safe HTML components only
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Eye,
  Send,
  Save,
  Code2,
  Type,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronDown,
  Smartphone,
  Monitor,
  Mail,
  FileText,
  Sparkles,
  MousePointer,
  AtSign,
  Building2,
  User,
  Lightbulb,
  Bot,
  Zap,
  AlertCircle,
  Loader2,
  Minus,
  MoveVertical,
  PenLine,
  GripVertical,
  Trash2,
  Plus,
  Image,
  Link as LinkIcon,
  Bold,
  Italic,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  Settings2,
  Maximize2,
  Minimize2,
  Palette,
  X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeHtmlForIframePreview } from "@/lib/html-preview";
import { cn } from "@/lib/utils";
import { buildBrandedEmailHtml, type BrandPaletteKey, type BrandPaletteOverrides, type EmailTemplateCopy } from "@/components/email-builder/ai-email-template";

// Content Block Types for Visual Editor
type BlockType = 'text' | 'button' | 'image' | 'divider' | 'spacer' | 'heading' | 'list';

// Prefill merge tags for CTA URLs — must use flat tokens that the
// bulk-email-service replaces at send time (NOT {{contact.X}} format)
const PREFILL_QUERY = [
  'email={{email}}',
  'firstName={{firstName}}',
  'lastName={{lastName}}',
  'company={{company}}',
  'phone={{phone}}'
].join('&');

interface ContentBlock {
  id: string;
  type: BlockType;
  content: string;
  settings?: {
    align?: 'left' | 'center' | 'right';
    buttonUrl?: string;
    buttonColor?: string;
    prefillEnabled?: boolean;
    imageUrl?: string;
    imageAlt?: string;
    headingLevel?: 1 | 2 | 3;
    listType?: 'bullet' | 'numbered';
  };
}

// Types - extends to include project/org context from Step 1
interface CampaignIntent {
  campaignName: string;
  senderProfileId: string;
  senderName: string;
  fromEmail: string;
  replyToEmail: string;
  subject: string;
  preheader?: string;
  campaignProviderId?: string | null;
  campaignProviderName?: string | null;
  campaignProviderKey?: string | null;
  domainAuthId?: number | null;
  domainName?: string | null;
  // Project & org context (from Step 1 selection)
  clientAccountId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  projectDescription?: string;
  projectLandingPageUrl?: string;
  campaignOrganizationId?: string;
}

interface TemplateData {
  subject: string;
  preheader: string;
  bodyContent: string;
  htmlContent: string;
  ctaUrl?: string;
}

interface SimpleTemplateBuilderProps {
  campaignIntent: CampaignIntent;
  initialTemplate?: Partial;
  organizationName?: string;
  organizationAddress?: string;
  onSave: (template: TemplateData) => void;
  onSendTest?: (emails: string[], template: TemplateData) => void;
  onBack: () => void;
}

interface SmartNudge {
  id: string;
  type: "warning" | "info" | "success" | "error";
  message: string;
  field?: "subject" | "body" | "cta" | "links";
}

type AdminTemplateTone = "professional" | "friendly" | "direct";
type AdminTemplateDesign = "plain" | "branded";

interface GeneratedAdminTemplateResponse {
  success: boolean;
  template?: {
    subject?: string;
    preheader?: string;
    bodyText?: string;
    bodyHtml?: string;
    promptSource?: string;
    promptKeyUsed?: string | null;
    usedFallback?: boolean;
  };
}

// Spam trigger words
const SPAM_TRIGGER_WORDS = [
  "free", "act now", "limited time", "urgent", "click here", "winner",
  "congratulations", "guarantee", "no obligation", "risk free", "100%",
  "amazing", "incredible", "unbelievable", "miracle", "$$$", "!!!",
  "make money", "earn cash", "buy now", "order now"
];

// Email analysis
const analyzeEmail = (subject: string, body: string): SmartNudge[] => {
  const nudges: SmartNudge[] = [];

  // Subject line checks
  if (subject.length === 0) {
    nudges.push({ id: "subject-empty", type: "error", message: "Subject line is required", field: "subject" });
  } else if (subject.length  60) {
    nudges.push({ id: "subject-long", type: "warning", message: "Subject line may be truncated in mobile inboxes", field: "subject" });
  }

  // Spam word detection
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const foundSpamWords = SPAM_TRIGGER_WORDS.filter(word => subjectLower.includes(word) || bodyLower.includes(word));
  if (foundSpamWords.length > 0) {
    nudges.push({ id: "spam-words", type: "warning", message: `Spam-risk phrases detected: ${foundSpamWords.slice(0, 3).join(", ")}`, field: "body" });
  }

  // Exclamation marks
  const exclamationCount = (subject + body).match(/!/g)?.length || 0;
  if (exclamationCount > 3) {
    nudges.push({ id: "exclamation", type: "warning", message: "Too many exclamation marks can trigger spam filters", field: "body" });
  }

  // ALL CAPS
  const capsWords = subject.match(/\b[A-Z]{4,}\b/g);
  if (capsWords && capsWords.length > 1) {
    nudges.push({ id: "caps", type: "warning", message: "Avoid using ALL CAPS - it triggers spam filters", field: "subject" });
  }

  // CTA detection
  const hasCta = /]+href[^>]*>/i.test(body) || /\[CTA\]|\[BUTTON\]/i.test(body);
  if (!hasCta && body.length > 100) {
    nudges.push({ id: "no-cta", type: "info", message: "Consider adding a clear call-to-action (CTA)", field: "cta" });
  }

  // Link count
  const linkCount = (body.match(/]+href/gi) || []).length;
  if (linkCount > 5) {
    nudges.push({ id: "too-many-links", type: "warning", message: "Too many links can hurt deliverability. Keep it under 5.", field: "links" });
  }

  // Body length
  const textContent = body.replace(/]*>/g, '').trim();
  if (textContent.length > 0 && textContent.length  1500) {
    nudges.push({ id: "body-long", type: "info", message: "Long emails may reduce engagement. Consider being more concise.", field: "body" });
  }

  // Success checks
  if (nudges.filter(n => n.type === "error" || n.type === "warning").length === 0) {
    if (subject.length >= 20 && subject.length = 100 && textContent.length  /]*>/.test(value);

const normalizePlainTextToHtml = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(//g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, ""))
    .join("");
  return `${paragraphs}`;
};

const ensureHtmlBody = (value: string) =>
  looksLikeHtmlFragment(value) ? value : normalizePlainTextToHtml(value);

const normalizeGeneratorTone = (value: string): AdminTemplateTone => {
  if (value === "friendly") return "friendly";
  if (value === "direct") return "direct";
  return "professional";
};

const normalizeGeneratorDesign = (useBrandedTemplate: boolean): AdminTemplateDesign =>
  useBrandedTemplate ? "branded" : "plain";

const normalizeCtaUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("{{")) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const buildSimpleTemplateFragment = (bodyText: string, ctaLabel?: string, rawCtaUrl?: string) => {
  const safeBody = ensureHtmlBody(bodyText);
  const safeCtaUrl = normalizeCtaUrl(rawCtaUrl || "");
  if (!safeCtaUrl) return safeBody;
  const safeHref = safeCtaUrl.replace(/"/g, "&quot;");

  return `${safeBody}

  
    
      
        ${ctaLabel || "View Brief"}
      
    
  
`;
};

// Generate email-safe HTML with inline CSS
const generateCleanHtml = (bodyContent: string, organizationName: string, organizationAddress: string): string => {
  const footer = `
    
      
        ${organizationName}
        ${organizationAddress}
        
          Unsubscribe
          |
          Manage Preferences
        
      
    
  `;

  return `


  
  
  
  
  
  
  
    
      
        
        96
      
    
  
  
  Email
  
    body { margin: 0; padding: 0; }
    table { border-spacing: 0; }
    td { padding: 0; }
    img { border: 0; }
    p { margin: 0 0 16px 0; }
    h1, h2, h3 { margin: 0 0 16px 0; font-weight: 600; color: #111827; }
    h1 { font-size: 28px; }
    h2 { font-size: 24px; }
    h3 { font-size: 20px; }
    ul, ol { margin: 0 0 16px 0; padding-left: 24px; }
    li { margin: 0 0 8px 0; }
    a { color: #2563eb; text-decoration: underline; }
  


  
    
      
        
          
            
              ${bodyContent}
            
          
          ${footer}
        
      
    
  

`;
};

// Generate unique ID for blocks
const generateBlockId = () => `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Parse HTML content into content blocks
const parseHtmlToBlocks = (html: string): ContentBlock[] => {
  if (!html || html.trim() === '') {
    return [{ id: generateBlockId(), type: 'text', content: '' }];
  }
  
  const blocks: ContentBlock[] = [];
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Simple parsing - treat each major element as a block
  const elements = tempDiv.children;
  
  for (let i = 0; i  li.textContent).join('\n');
      blocks.push({
        id: generateBlockId(),
        type: 'list',
        content: items,
        settings: { listType: tagName === 'ul' ? 'bullet' : 'numbered' }
      });
    } else if (tagName === 'img') {
      blocks.push({
        id: generateBlockId(),
        type: 'image',
        content: '',
        settings: {
          imageUrl: el.getAttribute('src') || '',
          imageAlt: el.getAttribute('alt') || ''
        }
      });
    } else if (el.textContent?.trim()) {
      blocks.push({
        id: generateBlockId(),
        type: 'text',
        content: el.innerHTML || el.textContent || ''
      });
    }
  }
  
  // If no blocks found, create a single text block with the raw content
  if (blocks.length === 0) {
    blocks.push({ id: generateBlockId(), type: 'text', content: html });
  }
  
  return blocks;
};

// Serialize content blocks back to HTML
const blocksToHtml = (blocks: ContentBlock[]): string => {
  return blocks.map(block => {
    switch (block.type) {
      case 'text':
        return `${block.content}`;
      case 'heading':
        const level = block.settings?.headingLevel || 2;
        const sizes: Record = { 1: '28px', 2: '24px', 3: '20px' };
        return `
          ${block.content}
        `;
      case 'button':
        let btnUrl = block.settings?.buttonUrl || '#';
        if (block.settings?.prefillEnabled && btnUrl !== '#') {
          const separator = btnUrl.includes('?') ? '&' : '?';
          btnUrl = `${btnUrl}${separator}${PREFILL_QUERY}`;
        }
        return `

  
    
      
        ${block.content}
      
    
  
`;
      case 'image':
        return ``;
      case 'divider':
        return '';
      case 'spacer':
        return '';
      case 'list':
        const listTag = block.settings?.listType === 'numbered' ? 'ol' : 'ul';
        const items = block.content.split('\n').filter(Boolean).map(item => `${item}`).join('');
        return `${items}`;
      default:
        return block.content;
    }
  }).join('\n');
};

// Personalization tokens — must match keys in bulk-email-service customVariables
const PERSONALIZATION_TOKENS = [
  { token: "{{firstName}}", label: "First Name", icon: User },
  { token: "{{lastName}}", label: "Last Name", icon: User },
  { token: "{{company}}", label: "Company", icon: Building2 },
  { token: "{{email}}", label: "Email", icon: AtSign },
  { token: "{{jobTitle}}", label: "Job Title", icon: User },
];

// Outreach types for AI
const OUTREACH_TYPES = [
  { value: "cold-outreach", label: "Cold Outreach" },
  { value: "follow-up", label: "Follow-up" },
  { value: "abm-outreach", label: "ABM Outreach" },
  { value: "event-invite", label: "Event Invite" },
  { value: "content-promotion", label: "Content Promotion" },
  { value: "meeting-request", label: "Meeting Request" },
];

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "consultative", label: "Consultative" },
  { value: "direct", label: "Direct" },
  { value: "friendly", label: "Friendly" },
];

const BRAND_COLOR_PRESETS: Record = {
  indigo: {
    primary: "#4f46e5",
    secondary: "#7c3aed",
    accent: "#22d3ee",
    surface: "#f8fafc",
    button: "#4f46e5"
  },
  emerald: {
    primary: "#10b981",
    secondary: "#22c55e",
    accent: "#a3e635",
    surface: "#f0fdf4",
    button: "#16a34a"
  },
  slate: {
    primary: "#0f172a",
    secondary: "#1e293b",
    accent: "#38bdf8",
    surface: "#f8fafc",
    button: "#0ea5e9"
  }
};

const BRAND_PALETTE_OPTIONS: BrandPaletteKey[] = ["indigo", "emerald", "slate"];

const buildHeroGradient = (colors: { primary: string; secondary: string; accent: string }) =>
  `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 50%, ${colors.accent} 100%)`;

const insertAtSelection = (value: string, token: string, selectionStart?: number, selectionEnd?: number) => {
  const start = typeof selectionStart === "number" ? selectionStart : value.length;
  const end = typeof selectionEnd === "number" ? selectionEnd : value.length;
  return `${value.slice(0, start)}${token}${value.slice(end)}`;
};

const extractBodyHtml = (html: string): string => {
  try {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return parsed.body?.innerHTML || html;
  } catch {
    return html;
  }
};

const injectClickCaptureScript = (html: string): string => {
  if (!html) return html;
  const script = `
`;
  const bodyClose = //i;
  if (bodyClose.test(html)) {
    return html.replace(bodyClose, `${script}`);
  }
  return `${html}${script}`;
};

export function SimpleTemplateBuilder({
  campaignIntent,
  initialTemplate,
  organizationName = "Your Company",
  organizationAddress = "123 Business St, City, State 12345",
  onSave,
  onSendTest,
  onBack
}: SimpleTemplateBuilderProps) {
  const { toast } = useToast();
  
  // Organization state overrides
  const [orgName, setOrgName] = useState(organizationName);
  const [orgAddress, setOrgAddress] = useState(organizationAddress);
  const [organizationIntelligence, setOrganizationIntelligence] = useState | null>(null);

  // Organization branding colors (loaded from campaign org)
  const [orgBrandColors, setOrgBrandColors] = useState(null);
  const [orgBrandLoading, setOrgBrandLoading] = useState(false);
  const [useOrgBrand, setUseOrgBrand] = useState(false);

  // Core state - use htmlContent if bodyContent is empty (for edit mode compatibility)
  const initialBodyContent = initialTemplate?.bodyContent || initialTemplate?.htmlContent || "";
  const initialIsBrandedTemplate = Boolean(
    initialBodyContent &&
      (initialBodyContent.includes("box-shadow: 0 20px 60px") ||
        initialBodyContent.includes("demangent-logo") ||
        initialBodyContent.includes("(
    "visual"  // Always start in visual mode for better UX
  );
  const [useBrandedTemplate, setUseBrandedTemplate] = useState(initialIsBrandedTemplate);
  
  // Visual editor block state
  const [blocks, setBlocks] = useState(() => 
    parseHtmlToBlocks(initialBodyContent)
  );
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [draggedBlockId, setDraggedBlockId] = useState(null);
  const [dragOverBlockId, setDragOverBlockId] = useState(null);
  
  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState("gmail-desktop");
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  
  // AgentX state
  const [outreachType, setOutreachType] = useState("cold-outreach");
  const [tone, setTone] = useState("professional");
  // Pre-populate context with project details when available
  const [aiContext, setAiContext] = useState(() => {
    const parts: string[] = [];
    parts.push(`Campaign: ${campaignIntent.campaignName}`);
    if (campaignIntent.projectName) parts.push(`Project: ${campaignIntent.projectName}`);
    if (campaignIntent.projectDescription) parts.push(campaignIntent.projectDescription);
    if (campaignIntent.clientName) parts.push(`Client: ${campaignIntent.clientName}`);
    if (campaignIntent.projectLandingPageUrl) parts.push(`Landing Page: ${campaignIntent.projectLandingPageUrl}`);
    return parts.join("\n\n");
  });
  const [aiGenerating, setAiGenerating] = useState(false);
  const [ctaUrl, setCtaUrl] = useState(
    initialTemplate?.ctaUrl || campaignIntent.projectLandingPageUrl || "https://example.com"
  );
  const [brandPalette, setBrandPalette] = useState("indigo");
  const [useCustomBrandColors, setUseCustomBrandColors] = useState(false);
  const [brandColors, setBrandColors] = useState(BRAND_COLOR_PRESETS.indigo);
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(true);
  const [selectedMergeToken, setSelectedMergeToken] = useState(undefined);

  const htmlEditorRef = useRef(null);
  const activeEditorRef = useRef(null);
  
  // Sync blocks to bodyContent when in visual mode
  useEffect(() => {
    if (editorMode === 'visual' && !useBrandedTemplate) {
      const html = blocksToHtml(blocks);
      setBodyContent(html);
    }
  }, [blocks, editorMode, useBrandedTemplate]);
  
  // Parse bodyContent to blocks when switching to visual mode
  useEffect(() => {
    if (editorMode === 'visual' && !useBrandedTemplate) {
      const newBlocks = parseHtmlToBlocks(bodyContent);
      if (newBlocks.length > 0) {
        setBlocks(newBlocks);
      }
    }
  }, [editorMode]);

  useEffect(() => {
    if (!useCustomBrandColors && !useOrgBrand) {
      setBrandColors(BRAND_COLOR_PRESETS[brandPalette]);
    }
  }, [brandPalette, useCustomBrandColors, useOrgBrand]);

  // Fetch org branding colors when campaignOrganizationId is available
  useEffect(() => {
    if (!campaignIntent.campaignOrganizationId) return;
    let active = true;
    const fetchOrgBranding = async () => {
      setOrgBrandLoading(true);
      try {
        const res = await apiRequest("GET", `/api/organizations/${campaignIntent.campaignOrganizationId}`);
        if (!res.ok) throw new Error("Failed to load org");
        const org = await res.json();
        if (!active) return;
        const organization = org.organization || org;
        const branding = organization.branding || {};
        setOrganizationIntelligence(organization);
        if (branding.primaryColor) {
          const colors = {
            primary: branding.primaryColor,
            secondary: branding.secondaryColor || branding.primaryColor,
          };
          setOrgBrandColors(colors);
          // Auto-apply org colors as custom brand
          const derived = {
            primary: colors.primary,
            secondary: colors.secondary,
            accent: colors.secondary,
            surface: "#f8fafc",
            button: colors.primary,
          };
          setBrandColors(derived);
          setUseCustomBrandColors(true);
          setUseOrgBrand(true);
        }
        // Also update org name from intelligence if available
        if (organization.name && organization.name !== organizationName) {
          setOrgName(organization.name);
        }
        // Update tone from branding if available
        if (branding.tone) {
          const toneMap: Record = {
            'Professional': 'professional',
            'Consultative': 'consultative',
            'Direct': 'direct',
            'Friendly': 'friendly',
          };
          const mappedTone = toneMap[branding.tone] || branding.tone.toLowerCase();
          if (TONE_OPTIONS.some(t => t.value === mappedTone)) {
            setTone(mappedTone);
          }
        }
      } catch (e) {
        console.warn("[SimpleTemplateBuilder] Failed to load org branding:", e);
      } finally {
        if (active) setOrgBrandLoading(false);
      }
    };
    fetchOrgBranding();
    return () => { active = false; };
  }, [campaignIntent.campaignOrganizationId]);

  useEffect(() => {
    if (editorMode === "html" && useBrandedTemplate) {
      htmlEditorRef.current?.focus();
    }
  }, [editorMode, useBrandedTemplate]);

  const updateBrandColor = useCallback((key: keyof typeof brandColors, value: string) => {
    setBrandColors(prev => ({ ...prev, [key]: value }));
  }, []);

  const extractBrandedBlocks = useCallback((html: string) => {
    try {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const blockNodes = Array.from(parsed.querySelectorAll("[data-block]"));
      if (blockNodes.length === 0) return { blocks: [] as ContentBlock[] };

      const blocks: ContentBlock[] = [];
      blockNodes.forEach((node) => {
        const blockType = node.getAttribute("data-block");
        if (!blockType) return;

        if (blockType === "heading") {
          blocks.push({
            id: generateBlockId(),
            type: "heading",
            content: node.textContent?.trim() || "",
            settings: { headingLevel: 1 }
          });
          return;
        }

        if (blockType === "subheading") {
          blocks.push({
            id: generateBlockId(),
            type: "heading",
            content: node.textContent?.trim() || "",
            settings: { headingLevel: 3 }
          });
          return;
        }

        if (blockType === "bullets") {
          const items = Array.from(node.querySelectorAll("li"))
            .map(item => item.textContent?.trim())
            .filter(Boolean)
            .join("\n");
          blocks.push({
            id: generateBlockId(),
            type: "list",
            content: items,
            settings: { listType: "bullet" }
          });
          return;
        }

        if (blockType === "cta") {
          const href = node.getAttribute("href") || "";
          blocks.push({
            id: generateBlockId(),
            type: "button",
            content: node.textContent?.trim() || "Learn more",
            settings: {
              buttonUrl: href,
              buttonColor: "#2563eb"
            }
          });
          return;
        }

        blocks.push({
          id: generateBlockId(),
          type: "text",
          content: node.innerHTML || node.textContent || ""
        });
      });

      return { blocks };
    } catch {
      return { blocks: [] as ContentBlock[] };
    }
  }, []);

  const convertAiTemplateToBlocks = useCallback((clickedBlock?: string | null) => {
    const { blocks: brandedBlocks } = extractBrandedBlocks(bodyContent);
    const fallbackBlocks = parseHtmlToBlocks(extractBodyHtml(bodyContent));
    const nextBlocks = brandedBlocks.length > 0 ? brandedBlocks : fallbackBlocks;

    setUseBrandedTemplate(false);
    setEditorMode("visual");
    setBlocks(nextBlocks);
    setBodyContent(blocksToHtml(nextBlocks));

    if (clickedBlock) {
      const typeMap: Record = {
        heading: "heading",
        subheading: "heading",
        intro: "text",
        bullets: "list",
        cta: "button",
        closing: "text",
      };
      const targetType = typeMap[clickedBlock];
      const target = nextBlocks.find(block => block.type === targetType);
      if (target) {
        setSelectedBlockId(target.id);
        setEditingBlockId(target.id);
      }
    }

    toast({
      title: "AI template converted",
      description: "Switched to visual blocks for editing."
    });
  }, [bodyContent, extractBrandedBlocks, toast]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event?.data?.type === "ai-template-click") {
        convertAiTemplateToBlocks(event.data.block);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [convertAiTemplateToBlocks]);
  
  // Smart nudges
  const nudges = useMemo(() => analyzeEmail(subject, bodyContent), [subject, bodyContent]);
  const hasErrors = nudges.some(n => n.type === "error");
  const hasWarnings = nudges.some(n => n.type === "warning");
  
  const normalizedBodyContent = useMemo(() => {
    if (useBrandedTemplate) return bodyContent;
    return ensureHtmlBody(bodyContent);
  }, [bodyContent, useBrandedTemplate]);

  // Generate full HTML
  const fullHtml = useMemo(() => {
    if (useBrandedTemplate) {
      return bodyContent;
    }
    return generateCleanHtml(normalizedBodyContent, orgName, orgAddress);
  }, [bodyContent, orgName, orgAddress, useBrandedTemplate, normalizedBodyContent]);

  const brandedPreviewHtml = useMemo(() => {
    if (!useBrandedTemplate) return normalizedBodyContent;
    return injectClickCaptureScript(bodyContent);
  }, [bodyContent, useBrandedTemplate, normalizedBodyContent]);
  
  // Generate plain text version
  const plainTextVersion = useMemo(() => {
    let text = bodyContent
      .replace(//gi, "\n")
      .replace(//gi, "\n\n")
      .replace(//gi, "\n")
      .replace(//gi, "• ")
      .replace(//gi, "\n")
      .replace(/]+href="([^"]*)"[^>]*>([^/gi, "$2 ($1)")
      .replace(/]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    
    if (!useBrandedTemplate) {
      text += `\n\n---\n${orgName}\n${orgAddress}\n\nUnsubscribe: {{unsubscribe_url}}`;
    }
    return text;
  }, [bodyContent, orgName, orgAddress, useBrandedTemplate]);

  const routeSummary = useMemo(() => ({
    provider: campaignIntent.campaignProviderName || campaignIntent.campaignProviderKey || "Default routing",
    domain: campaignIntent.domainName || "Sender-linked domain",
    replyTo: campaignIntent.replyToEmail || campaignIntent.fromEmail,
  }), [campaignIntent]);

  const mergeTokens = useMemo(() => PERSONALIZATION_TOKENS.map((item) => item.token), []);
  
  // Block manipulation functions for visual editor
  const addBlock = useCallback((type: BlockType, afterId?: string) => {
    const resolvedCtaUrl = ctaUrl?.trim() ? ctaUrl.trim() : "https://example.com";
    const newBlock: ContentBlock = {
      id: generateBlockId(),
      type,
      content: type === 'text' ? '' : type === 'button' ? 'Click Here' : type === 'heading' ? 'Heading' : '',
      settings: type === 'button' ? { buttonUrl: resolvedCtaUrl, buttonColor: '#2563eb' } : 
                type === 'heading' ? { headingLevel: 2 } :
                type === 'list' ? { listType: 'bullet' } : undefined
    };
    
    setBlocks(prev => {
      if (afterId) {
        const index = prev.findIndex(b => b.id === afterId);
        if (index !== -1) {
          return [...prev.slice(0, index + 1), newBlock, ...prev.slice(index + 1)];
        }
      }
      return [...prev, newBlock];
    });
    setEditingBlockId(newBlock.id);
    setSelectedBlockId(newBlock.id);
  }, [ctaUrl]);
  
  const updateBlock = useCallback((id: string, updates: Partial) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);
  
  const deleteBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const filtered = prev.filter(b => b.id !== id);
      return filtered.length > 0 ? filtered : [{ id: generateBlockId(), type: 'text', content: '' }];
    });
    setSelectedBlockId(null);
    setEditingBlockId(null);
  }, []);
  
  const moveBlock = useCallback((fromId: string, toId: string) => {
    setBlocks(prev => {
      const fromIndex = prev.findIndex(b => b.id === fromId);
      const toIndex = prev.findIndex(b => b.id === toId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return prev;
      
      const newBlocks = [...prev];
      const [removed] = newBlocks.splice(fromIndex, 1);
      newBlocks.splice(toIndex, 0, removed);
      return newBlocks;
    });
    setDraggedBlockId(null);
    setDragOverBlockId(null);
  }, []);
  
  const captureEditorSelection = useCallback((
    entry: { type: "block" | "body"; blockId?: string; field?: "content" | "buttonUrl" },
    target: HTMLTextAreaElement | HTMLInputElement
  ) => {
    activeEditorRef.current = {
      ...entry,
      selectionStart: target.selectionStart ?? target.value.length,
      selectionEnd: target.selectionEnd ?? target.value.length
    };
  }, []);

  // Insert personalization token into current block or bodyContent
  const insertToken = useCallback((token: string) => {
    const activeEditor = activeEditorRef.current;
    if (activeEditor?.type === "block" && activeEditor.blockId) {
      setBlocks(prev => prev.map(b => {
        if (b.id !== activeEditor.blockId) return b;
        if (activeEditor.field === "buttonUrl") {
          const currentValue = b.settings?.buttonUrl || "";
          return {
            ...b,
            settings: {
              ...b.settings,
              buttonUrl: insertAtSelection(currentValue, token, activeEditor.selectionStart, activeEditor.selectionEnd)
            }
          };
        }
        return {
          ...b,
          content: insertAtSelection(b.content || "", token, activeEditor.selectionStart, activeEditor.selectionEnd)
        };
      }));
      return;
    }

    if (activeEditor?.type === "body") {
      setBodyContent(prev => insertAtSelection(prev, token, activeEditor.selectionStart, activeEditor.selectionEnd));
      return;
    }

    if (editorMode === 'visual' && editingBlockId) {
      setBlocks(prev => prev.map(b =>
        b.id === editingBlockId ? { ...b, content: b.content + token } : b
      ));
    } else {
      setBodyContent(prev => prev + token);
    }
  }, [editorMode, editingBlockId]);
  
  // Insert CTA button
  const insertCtaButton = useCallback(() => {
    const resolvedCtaUrl = ctaUrl?.trim() ? ctaUrl.trim() : "https://example.com";
    if (editorMode === 'visual') {
      addBlock('button', selectedBlockId || undefined);
    } else {
      const ctaHtml = `

  
    
      
        Click Here
      
    
  
`;
      setBodyContent(prev => prev + ctaHtml);
    }
  }, [editorMode, selectedBlockId, addBlock, ctaUrl]);
  
  // Insert divider
  const insertDivider = useCallback(() => {
    if (editorMode === 'visual') {
      addBlock('divider', selectedBlockId || undefined);
    } else {
      setBodyContent(prev => prev + '\n\n');
    }
  }, [editorMode, selectedBlockId, addBlock]);
  
  // Insert spacer
  const insertSpacer = useCallback(() => {
    if (editorMode === 'visual') {
      addBlock('spacer', selectedBlockId || undefined);
    } else {
      setBodyContent(prev => prev + '\n\n');
    }
  }, [editorMode, selectedBlockId, addBlock]);
  
  // Insert signature block
  const insertSignature = useCallback(() => {
    if (editorMode === 'visual') {
      addBlock('text', selectedBlockId || undefined);
      // Update the last added block with signature content
      setBlocks(prev => {
        const lastBlock = prev[prev.length - 1];
        if (lastBlock) {
          return prev.map((b, i) => i === prev.length - 1 ? {
            ...b,
            content: `${campaignIntent.senderName}${campaignIntent.fromEmail}`
          } : b);
        }
        return prev;
      });
    } else {
      const signature = `

  ${campaignIntent.senderName}
  ${campaignIntent.fromEmail}
`;
      setBodyContent(prev => prev + signature);
    }
  }, [editorMode, selectedBlockId, addBlock, campaignIntent]);
  
  // AI Generate Email
  const handleAiGenerate = async () => {
    setAiGenerating(true);
    const buildCopy = (overrides: Partial = {}): EmailTemplateCopy => {
      const fallbackBullets = [
        "Clear value tailored to your team.",
        "Fast setup with measurable impact.",
        "Support from our team end to end."
      ];
      const bullets = Array.isArray(overrides.valueBullets)
        ? overrides.valueBullets.filter(Boolean)
        : [];
      while (bullets.length  {
      const paletteOverrides: BrandPaletteOverrides | undefined = useCustomBrandColors
        ? {
            heroGradient: buildHeroGradient(brandColors),
            cta: brandColors.primary,
            accent: brandColors.accent,
            surface: brandColors.surface,
            button: brandColors.button
          }
        : undefined;
      const html = buildBrandedEmailHtml({
        copy,
        brandPalette,
        paletteOverrides,
        companyName: orgName,
        companyAddress: orgAddress,
        includeFooter: true
      });
      setBodyContent(html);
      setUseBrandedTemplate(true);
      setEditorMode("code");
      if (!subject && copy.subject) {
        setSubject(copy.subject);
      }
      if (!preheader && copy.preheader) {
        setPreheader(copy.preheader);
      }
    };

    const applySimpleTemplate = (nextSubject: string, nextPreheader: string, nextBodyText: string, nextCtaLabel?: string) => {
      const fragment = buildSimpleTemplateFragment(
        nextBodyText,
        nextCtaLabel,
        ctaUrl?.trim() ? ctaUrl.trim() : campaignIntent.projectLandingPageUrl || ""
      );
      const nextBlocks = parseHtmlToBlocks(fragment);
      setUseBrandedTemplate(false);
      setEditorMode("visual");
      setBlocks(nextBlocks);
      setBodyContent(blocksToHtml(nextBlocks));
      setSubject(nextSubject);
      setPreheader(nextPreheader);
    };

    try {
      const design = normalizeGeneratorDesign(useBrandedTemplate);
      const res = await apiRequest("POST", "/api/admin/email-campaign-templates/generate", {
        projectId: campaignIntent.projectId,
        clientAccountId: campaignIntent.clientAccountId,
        campaignType: outreachType,
        channel: "email",
        tone: normalizeGeneratorTone(tone),
        design,
        campaignName: campaignIntent.campaignName,
        objective: campaignIntent.projectDescription || campaignIntent.projectName || campaignIntent.campaignName,
        description: aiContext,
        targetAudience: campaignIntent.clientName
          ? `Contacts relevant to ${campaignIntent.clientName}${campaignIntent.projectName ? ` and ${campaignIntent.projectName}` : ""}`
          : campaignIntent.projectName || campaignIntent.campaignName,
        successCriteria: `Generate qualified engagement for ${campaignIntent.projectName || campaignIntent.campaignName}.`,
        landingPageUrl: ctaUrl?.trim() || campaignIntent.projectLandingPageUrl || "",
        organizationName: orgName,
        organizationIntelligence,
        recipient: {
          firstName: "Alex",
          company: campaignIntent.clientName || orgName,
          jobTitle: "",
          industry: "",
        },
      });
      if (!res.ok) {
        throw new Error("Template generation failed");
      }

      const data = (await res.json()) as GeneratedAdminTemplateResponse;
      const generated = data.template;
      if (!generated) {
        throw new Error("Template generator returned no template");
      }

      const nextSubject = generated.subject || subject || `Quick question about ${campaignIntent.campaignName}`;
      const nextPreheader = generated.preheader || preheader || `A quick note about ${campaignIntent.campaignName}`;
      const nextBodyText = generated.bodyText || aiContext || campaignIntent.campaignName;

      if (design === "plain") {
        applySimpleTemplate(nextSubject, nextPreheader, nextBodyText, "View Brief");
      } else if (generated.bodyHtml) {
        setBodyContent(generated.bodyHtml);
        setUseBrandedTemplate(true);
        setEditorMode("code");
        setSubject(nextSubject);
        setPreheader(nextPreheader);
      } else {
        const copy = buildCopy({
          subject: nextSubject,
          preheader: nextPreheader,
          intro: nextBodyText,
          ctaUrl: ctaUrl?.trim() || campaignIntent.projectLandingPageUrl || undefined,
        });
        applyBrandedTemplate(copy);
      }

      toast({
        title: "Email generated",
        description: "Template and campaign context were generated from the selected client project."
      });
    } catch (error) {
      const copy = buildCopy();
      if (normalizeGeneratorDesign(useBrandedTemplate) === "plain") {
        applySimpleTemplate(
          copy.subject,
          copy.preheader || "",
          `${copy.intro}\n\n${copy.valueBullets.map((bullet) => `- ${bullet}`).join("\n")}\n\n${copy.closingLine}`,
          copy.ctaLabel
        );
      } else {
        applyBrandedTemplate(copy);
      }
      toast({
        title: "Template generated",
        description: "AI unavailable - using the simple campaign template fallback"
      });
    } finally {
      setAiGenerating(false);
    }
  };
  
  // Handle save
  const handleSave = () => {
    if (!subject.trim()) {
      toast({
        title: "Subject required",
        description: "Please enter a subject line",
        variant: "destructive"
      });
      return;
    }
    
    onSave({
      subject,
      preheader,
      bodyContent,
      htmlContent: fullHtml,
      ctaUrl: ctaUrl?.trim() || campaignIntent.projectLandingPageUrl || "",
    });
  };
  
  // Handle test send
  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please enter a test email address",
        variant: "destructive"
      });
      return;
    }
    
    if (!onSendTest) {
      toast({
        title: "Test not available",
        description: "Test email sending is not configured",
        variant: "destructive"
      });
      return;
    }
    
    setSendingTest(true);
    try {
      const emails = testEmail.split(",").map(e => e.trim()).filter(Boolean);
      if (emails.length === 0) {
        toast({
          title: "Invalid email",
          description: "Please enter a valid email address",
          variant: "destructive"
        });
        return;
      }
      
      await onSendTest(emails, {
        subject,
        preheader,
        bodyContent,
        htmlContent: fullHtml,
        ctaUrl: ctaUrl?.trim() || campaignIntent.projectLandingPageUrl || "",
      });
      toast({
        title: "Test email sent",
        description: `Sent to ${emails.join(", ")}`
      });
    } catch (error: any) {
      console.error("[Send Test] Error:", error);
      toast({
        title: "Failed to send test",
        description: error?.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setSendingTest(false);
    }
  };
  
  return (
    
      
        {/* Top Bar - Sticky */}
        
          
            {/* Back Button */}
            
              
              Back to Campaign
            
            
            
            
            {/* Campaign Name Badge */}
            
              
                {campaignIntent.campaignName}
              
              
                Step 2 of 3
              
              
                {routeSummary.provider}
              
              
                {routeSummary.domain}
              
            
          
          
          {/* Center Toolbar */}
          
            {/* AgentX Sheet */}
            
              
                
                  
                  AgentX
                
              
              
                
                  
                    
                      
                         
                      
                      
                    
                    
                      AgentX
                      Content Copilot
                    
                  
                
                
                  {/* Project Context Banner */}
                  {(campaignIntent.projectName || campaignIntent.clientName) && (
                    
                      Campaign context
                      {campaignIntent.clientName && (
                        Client: {campaignIntent.clientName}
                      )}
                      {campaignIntent.projectName && (
                        Project: {campaignIntent.projectName}
                      )}
                      {campaignIntent.campaignOrganizationId && (
                        
                          
                          Org intelligence will be used for generation
                        
                      )}
                    
                  )}

                  {/* AI Form */}
                  
                    
                      Outreach Type
                      
                        
                        {OUTREACH_TYPES.map(t => {t.label})}
                      
                    
                    
                      Tone
                      
                        
                        {TONE_OPTIONS.map(t => {t.label})}
                      
                    
                    
                      Context
                       setAiContext(e.target.value)} 
                        placeholder="Add specific details..." 
                        className="text-xs h-24" 
                      />
                    
                    
                      CTA URL
                       setCtaUrl(e.target.value)} className="text-xs" />
                    
                    
                    {/* Brand Palette */}
                    
                      Brand Palette

                      {/* Organization brand colors (auto-loaded) */}
                      {orgBrandColors && (
                         {
                            const derived = {
                              primary: orgBrandColors.primary,
                              secondary: orgBrandColors.secondary,
                              accent: orgBrandColors.secondary,
                              surface: "#f8fafc",
                              button: orgBrandColors.primary,
                            };
                            setBrandColors(derived);
                            setUseCustomBrandColors(true);
                            setUseOrgBrand(true);
                          }}
                          className={`w-full text-xs ${useOrgBrand ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                        >
                          
                            
                              
                              
                            
                            {useOrgBrand ? "Using Organization Colors" : "Apply Organization Colors"}
                          
                        
                      )}
                      {orgBrandLoading && (
                        
                          
                          Loading org brand...
                        
                      )}

                      {/* Preset palette selector */}
                       {
                        setBrandPalette(value as BrandPaletteKey);
                        setUseOrgBrand(false);
                        setUseCustomBrandColors(false);
                      }}>
                        
                          
                        
                        
                          {BRAND_PALETTE_OPTIONS.map((option) => (
                            
                              
                                
                                  
                                  
                                
                                {option.charAt(0).toUpperCase() + option.slice(1)}
                              
                            
                          ))}
                        
                      
                       {
                          setUseCustomBrandColors(prev => !prev);
                          setUseOrgBrand(false);
                        }}
                        className="w-full text-xs"
                      >
                        
                        {useCustomBrandColors && !useOrgBrand ? "Using custom colors" : "Customize brand colors"}
                      
                      {useCustomBrandColors && (
                        
                          {([
                            { key: "primary", label: "Primary" },
                            { key: "secondary", label: "Secondary" },
                            { key: "accent", label: "Accent" },
                            { key: "surface", label: "Surface" },
                            { key: "button", label: "Button" }
                          ] as const).map(({ key, label }) => (
                            
                              {label}
                              
                                 {
                                    updateBrandColor(key, e.target.value);
                                    setUseOrgBrand(false);
                                  }}
                                  className="h-8 w-10 p-1"
                                />
                                 {
                                    updateBrandColor(key, e.target.value);
                                    setUseOrgBrand(false);
                                  }}
                                  className="text-[10px] h-8"
                                />
                              
                            
                          ))}
                        
                      )}

                      {/* Active color swatch preview */}
                      
                        Active Colors
                        
                          {([
                            { key: "primary" as const, label: "Primary" },
                            { key: "secondary" as const, label: "Secondary" },
                            { key: "accent" as const, label: "Accent" },
                            { key: "button" as const, label: "Button" },
                          ]).map(({ key, label }) => (
                            
                              
                              {label}
                            
                          ))}
                        
                      
                    

                    
                      {aiGenerating ?  : }
                      Generate Email
                    
                  
                  
                  
                  
                  {/* Smart Insights */}
                  
                    
                      
                      Smart Insights
                    
                    {nudges.length === 0 ? (
                      Start writing to see insights
                    ) : (
                      
                        {nudges.map(n => (
                          
                            
                            {n.message}
                          
                        ))}
                      
                    )}
                  
                
              
            

            {/* Components Sheet */}
            
              
                
                   
                   Tools
                
              
              
                 
                   Builder Tools
                   Add blocks and variables.
                 
                 
                    
                      Components
                      
                         insertToken(" ")} className="justify-start"> Text
                         Button
                         Divider
                         Spacer
                         Signature
                      
                    
                    
                    
                      Variables
                       { setSelectedMergeToken(undefined); insertToken(val); }}>
                        
                        
                          {PERSONALIZATION_TOKENS.map(t => (
                            {t.label} {t.token}
                          ))}
                        
                      
                      Click in editor to place cursor first.
                    
                 
              
            

            {/* Settings Sheet */}
            
              
                
                   
                   Settings
                
              
              
                 
                   Settings
                 
                 
                    
                        Footer Configuration
                        
                           Organization Name
                            setOrgName(e.target.value)} />
                        
                        
                           Address
                            setOrgAddress(e.target.value)} />
                        
                    
                    
                    
                      Send Test Email
                      
                         setTestEmail(e.target.value)} placeholder="email@example.com" />
                        
                          {sendingTest ?  : }
                        
                      
                    
                 
              
            
          
          
          
             setShowPreview(true)}>
              
              Preview
            
            
            
              
              Save
            
            
              
              Save & Continue
            
          
        
        
        {/* Subject & Preheader Row */}
        
          
            
              
                Subject
                 setSubject(e.target.value)}
                  placeholder="Write a compelling subject line..."
                  className="h-11 flex-1 border-0 bg-transparent px-2 text-base font-medium focus-visible:ring-1 focus-visible:ring-blue-500"
                />
                 60 ? 'text-amber-600' : 'text-slate-400'}`}>
                  {subject.length}/60
                
              
              
                Preview
                 setPreheader(e.target.value)}
                  placeholder="Preview text shows after subject in inbox..."
                  className="h-9 flex-1 border-0 bg-transparent px-2 text-sm focus-visible:ring-1 focus-visible:ring-blue-500"
                />
                {preheader.length}/150
              
            

            
              Envelope
              {campaignIntent.senderName} &lt;{campaignIntent.fromEmail}&gt;
              Replies to {routeSummary.replyTo}
            
          
        

        {/* Main Content Area */}
        
          
          
            {/* Editor Mode Toggle */}
            
              
                 setEditorMode("visual")} className="text-xs">
                   Visual
                
                 setEditorMode("code")} className="text-xs">
                   HTML
                
                 setIsCanvasExpanded(prev => !prev)} className="text-xs">
                  {isCanvasExpanded ?  : }
                  {isCanvasExpanded ? "Compact" : "Full width"}
                
              
            

            {/* Email Canvas Container */}
            
              
                {/* Email Container */}
                
                  {editorMode === "visual" ? (
                    useBrandedTemplate ? (
                      /* Full HTML Preview for AI-generated branded templates */
                      
                        
                          
                            
                            AI-generated branded template
                          
                           setEditorMode("html")} className="text-xs bg-white hover:bg-blue-50">
                             Edit HTML
                          
                        
                        
                      
                    ) : (
                    
                      {/* Visual Block Editor */}
                      
                        {blocks.map((block, index) => (
                           {
                              setDraggedBlockId(block.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              setDraggedBlockId(null);
                              setDragOverBlockId(null);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (draggedBlockId && draggedBlockId !== block.id) {
                                setDragOverBlockId(block.id);
                              }
                            }}
                            onDragLeave={() => setDragOverBlockId(null)}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggedBlockId && draggedBlockId !== block.id) {
                                moveBlock(draggedBlockId, block.id);
                              }
                            }}
                            onClick={() => {
                              setSelectedBlockId(block.id);
                              if (block.type === 'text' || block.type === 'heading' || block.type === 'button' || block.type === 'list') {
                                setEditingBlockId(block.id);
                              }
                            }}
                            className={`group relative rounded-lg transition-all cursor-move border border-transparent hover:border-slate-200 ${
                              selectedBlockId === block.id ? 'ring-2 ring-blue-500 ring-offset-2 border-blue-100 z-10' : ''
                            } ${dragOverBlockId === block.id ? 'border-t-4 border-t-blue-500' : ''} ${
                              draggedBlockId === block.id ? 'opacity-50' : ''
                            }`}
                          >
                            {/* Drag Handle & Actions */}
                            
                              
                                
                              
                            
                            
                            {/* Delete Button */}
                             {
                                e.stopPropagation();
                                deleteBlock(block.id);
                              }}
                              className={`absolute -right-3 -top-3 p-1 bg-red-500 text-white rounded-full shadow-sm transition-opacity hover:bg-red-600 z-20 ${selectedBlockId === block.id || 'group-hover:opacity-100 opacity-0'}`}
                            >
                              
                            
                            
                            {/* Block Content Rendering */}
                            
                              {/* Text Block */}
                              {block.type === 'text' && (
                                editingBlockId === block.id ? (
                                   updateBlock(block.id, { content: e.target.value })}
                                    onBlur={() => setEditingBlockId(null)}
                                    // Capture events for variable insertion
                                    onFocus={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onClick={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onKeyUp={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    placeholder="Type your text here..."
                                    className="w-full min-h-[60px] text-base leading-relaxed border-0 resize-none focus-visible:ring-0 p-0 bg-transparent"
                                  />
                                ) : (
                                  Click to add text...' }}
                                  />
                                )
                              )}
                              
                              {/* Heading Block */}
                              {block.type === 'heading' && (
                                editingBlockId === block.id ? (
                                   updateBlock(block.id, { content: e.target.value })}
                                    onBlur={() => setEditingBlockId(null)}
                                    onFocus={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onClick={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onKeyUp={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onKeyDown={(e) => e.key === 'Enter' && setEditingBlockId(null)}
                                    placeholder="Enter heading..."
                                    className={`w-full border-0 p-0 bg-transparent focus-visible:ring-0 font-semibold ${
                                      block.settings?.headingLevel === 1 ? 'text-3xl' : 
                                      block.settings?.headingLevel === 3 ? 'text-xl' : 'text-2xl'
                                    }`}
                                  />
                                ) : (
                                  
                                    {block.content || Click to add heading...}
                                  
                                )
                              )}
                              
                              {/* Button Block */}
                              {block.type === 'button' && (
                                
                                  {editingBlockId === block.id ? (
                                     {
                                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                          setEditingBlockId(null);
                                        }
                                      }}
                                    >
                                       updateBlock(block.id, { content: e.target.value })}
                                        onFocus={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                        onClick={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                        onKeyUp={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                        placeholder="Button text..."
                                        className="text-sm"
                                      />
                                       updateBlock(block.id, { settings: { ...block.settings, buttonUrl: e.target.value } })}
                                        onFocus={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "buttonUrl" }, e.currentTarget)}
                                        onClick={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "buttonUrl" }, e.currentTarget)}
                                        onKeyUp={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "buttonUrl" }, e.currentTarget)}
                                        placeholder="https://..."
                                        className="text-sm"
                                      />
                                      
                                         updateBlock(block.id, { settings: { ...block.settings, prefillEnabled: checked === true } })}
                                        />
                                        
                                          Pre-fill landing page fields
                                        
                                      
                                    
                                  ) : (
                                    
                                      {block.content || 'Click Here'}
                                    
                                  )}
                                
                              )}
                              
                              {/* Image Block */}
                              {block.type === 'image' && (
                                
                                  {block.settings?.imageUrl ? (
                                    
                                  ) : (
                                     {
                                        const url = prompt('Enter image URL:');
                                        if (url) {
                                          updateBlock(block.id, { settings: { ...block.settings, imageUrl: url } });
                                        }
                                      }}
                                    >
                                      
                                      Click to add image URL
                                    
                                  )}
                                
                              )}
                              
                              {/* Divider Block */}
                              {block.type === 'divider' && (
                                
                              )}
                              
                              {/* Spacer Block */}
                              {block.type === 'spacer' && (
                                
                                  Spacer
                                
                              )}
                              
                              {/* List Block */}
                              {block.type === 'list' && (
                                editingBlockId === block.id ? (
                                   updateBlock(block.id, { content: e.target.value })}
                                    onBlur={() => setEditingBlockId(null)}
                                    placeholder="Enter items, one per line..."
                                    className="w-full min-h-[80px] text-base leading-relaxed border-0 resize-none focus-visible:ring-0 p-0 bg-transparent"
                                  />
                                ) : (
                                  block.settings?.listType === 'numbered' ? (
                                    
                                      {block.content.split('\n').filter(Boolean).map((item, i) => (
                                        {item}
                                      ))}
                                    
                                  ) : (
                                    
                                      {block.content.split('\n').filter(Boolean).map((item, i) => (
                                        {item}
                                      ))}
                                    
                                  )
                                )
                              )}
                            
                          
                        ))}
                        
                        {/* Empty State / Add Hint */}
                        {blocks.length === 0 && (
                          
                            
                            Click "Tools" to add content blocks
                          
                        )}
                        
                        {/* Bottom Add Buttons */}
                        
                           addBlock('text')} className="text-slate-400 hover:text-blue-500">
                             Add Text
                          
                        
                      
                    
                    )
                  ) : (
                    
                      {/* Show back to preview button for branded templates */}
                      {useBrandedTemplate && (
                        
                          
                            
                            Editing HTML - Changes will update the preview
                          
                           setEditorMode("visual")}
                            className="text-xs bg-slate-600 border-slate-500 text-white hover:bg-slate-500"
                          >
                            
                            Preview
                          
                        
                      )}
                       setBodyContent(e.target.value)}
                        onFocus={(e) => captureEditorSelection({ type: "body" }, e.currentTarget)}
                        onClick={(e) => captureEditorSelection({ type: "body" }, e.currentTarget)}
                        onKeyUp={(e) => captureEditorSelection({ type: "body" }, e.currentTarget)}
                        onSelect={(e) => captureEditorSelection({ type: "body" }, e.currentTarget)}
                        placeholder="Enter HTML content..."
                        className={`w-full h-full min-h-[500px] p-4 font-mono text-sm border-0 resize-none focus-visible:ring-0 bg-slate-900 text-green-400 ${useBrandedTemplate ? 'pt-16' : ''}`}
                      />
                    
                  )}
                  
                  {/* Auto-injected Footer Preview */}
                  {!useBrandedTemplate && (
                    
                      {orgName}
                      {orgAddress}
                      
                        Unsubscribe
                        |
                        Manage Preferences
                      
                      
                        ↑ Auto-injected at send time (not editable)
                      
                    
                  )}
                
              
            
          
          
            
              
                
                  
                    
                      
                    
                    
                      Unified Email Agent
                      
                        Keep the brief aligned to the email agent architecture before generating or refining the template.
                      
                    
                  

                  
                    
                      Outreach Type
                      
                        
                        {OUTREACH_TYPES.map(t => {t.label})}
                      
                    
                    
                      Tone
                      
                        
                        {TONE_OPTIONS.map(t => {t.label})}
                      
                    
                  

                  
                    Unified Brief
                     setAiContext(e.target.value)}
                      placeholder="Describe goals, pain points, offer, proof, and CTA constraints..."
                      className="min-h-[140px] resize-none text-sm"
                    />
                  

                  
                    {aiGenerating ?  : }
                    Generate With Unified Agent
                  
                
              

              
                
                  
                    
                      Personalization and CTA
                      Use merge tags and prefilled landing page links without leaving the builder.
                    
                    {routeSummary.domain}
                  
                  
                    {mergeTokens.map((token) => (
                       insertToken(token)}>
                        {token}
                      
                    ))}
                  
                  
                    CTA URL
                     setCtaUrl(e.target.value)} className="text-sm" />
                    Enable prefill on CTA blocks to pass first name, last name, company, email, and phone into landing forms.
                  
                
              

              
                
                  
                    
                      Live Inbox Preview
                      Keep the email visible while you edit so the full template reads like an inbox artifact, not raw markup.
                    
                    
                       setPreviewMode("gmail-desktop")} className="text-[11px]">
                         Gmail
                      
                       setPreviewMode("gmail-mobile")} className="text-[11px]">
                         Mobile
                      
                    
                  

                  
                    {campaignIntent.senderName} &lt;{campaignIntent.fromEmail}&gt;
                    Subject: {subject || "(No subject)"}
                    {preheader && Preview: {preheader}}
                  

                  
                    
                      
                    
                  
                
              

              
                
                  
                    
                      Send Test and Quality Gate
                      Validate rendering and keep an eye on spam, CTA, and length guidance.
                    
                    
                      {hasErrors ? "Needs fixes" : hasWarnings ? "Review warnings" : "Ready"}
                    
                  
                  
                     setTestEmail(e.target.value)} placeholder="email@example.com" className="text-sm" />
                    
                      {sendingTest ?  : }
                    
                  
                  
                    {(nudges.length ? nudges : [{ id: "empty", type: "info", message: "Start writing to see insights." }]).slice(0, 4).map((nudge) => (
                      
                        {nudge.message}
                      
                    ))}
                  
                
              
            
          
          
        

        {/* Preview Modal */}
        
          
            
              
                Email Preview
                
                   setPreviewMode("gmail-desktop")} className="text-xs">
                     Gmail
                  
                   setPreviewMode("gmail-mobile")} className="text-xs">
                     Mobile
                  
                   setPreviewMode("outlook")} className="text-xs">
                     Outlook
                  
                
              
              
                Preview your email template across different email clients.
              
            

            {/* Active Brand Colors Strip */}
            
              Brand Colors:
              
                {[
                  { label: "Primary", color: brandColors.primary },
                  { label: "Secondary", color: brandColors.secondary },
                  { label: "Accent", color: brandColors.accent },
                  { label: "Button", color: brandColors.button },
                  { label: "Surface", color: brandColors.surface },
                ].map(({ label, color }) => (
                  
                    
                    {label}
                  
                ))}
              
              {useOrgBrand && orgBrandColors && (
                
                  Organization Colors
                
              )}
              {useCustomBrandColors && !useOrgBrand && (
                
                  Custom Colors
                
              )}
              {!useCustomBrandColors && !useOrgBrand && (
                
                  {brandPalette} Palette
                
              )}
            

            {/* Email Header Preview */}
            
              
                From:
                {campaignIntent.senderName} &lt;{campaignIntent.fromEmail}&gt;
              
              
                Subject:
                {subject || "(No subject)"}
              
              {preheader && (
                
                  Preview:
                  {preheader}
                
              )}
            
            
            {/* Preview Frame */}
            
              
                
                  
                    {previewMode === "outlook" ? "Microsoft Outlook" : "Gmail"}
                  
                
                
                  
                
              
            
          
        
      
    
  );
}

export default SimpleTemplateBuilder;