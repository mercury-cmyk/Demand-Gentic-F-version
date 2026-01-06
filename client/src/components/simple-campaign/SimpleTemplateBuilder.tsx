/**
 * SimpleTemplateBuilder - Page 2 of Simple Campaign Builder
 * 
 * Full-screen email editor with:
 * - Left/Main Area (70%): Email Canvas at 600px, text-first
 * - Right Sidebar: Components (drag & drop) + AI Assistant
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { buildBrandedEmailHtml, type BrandPaletteKey, type BrandPaletteOverrides, type EmailTemplateCopy } from "@/components/email-builder/ai-email-template";

// Content Block Types for Visual Editor
type BlockType = 'text' | 'button' | 'image' | 'divider' | 'spacer' | 'heading' | 'list';

interface ContentBlock {
  id: string;
  type: BlockType;
  content: string;
  settings?: {
    align?: 'left' | 'center' | 'right';
    buttonUrl?: string;
    buttonColor?: string;
    imageUrl?: string;
    imageAlt?: string;
    headingLevel?: 1 | 2 | 3;
    listType?: 'bullet' | 'numbered';
  };
}

// Types
interface CampaignIntent {
  campaignName: string;
  senderProfileId: string;
  senderName: string;
  fromEmail: string;
  replyToEmail: string;
  subject: string;
}

interface TemplateData {
  subject: string;
  preheader: string;
  bodyContent: string;
  htmlContent: string;
}

interface SimpleTemplateBuilderProps {
  campaignIntent: CampaignIntent;
  initialTemplate?: Partial<TemplateData>;
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
  } else if (subject.length < 20) {
    nudges.push({ id: "subject-short", type: "info", message: "Subject line might be too short. Aim for 30-60 characters.", field: "subject" });
  } else if (subject.length > 60) {
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
  const hasCta = /<a[^>]+href[^>]*>/i.test(body) || /\[CTA\]|\[BUTTON\]/i.test(body);
  if (!hasCta && body.length > 100) {
    nudges.push({ id: "no-cta", type: "info", message: "Consider adding a clear call-to-action (CTA)", field: "cta" });
  }

  // Link count
  const linkCount = (body.match(/<a[^>]+href/gi) || []).length;
  if (linkCount > 5) {
    nudges.push({ id: "too-many-links", type: "warning", message: "Too many links can hurt deliverability. Keep it under 5.", field: "links" });
  }

  // Body length
  const textContent = body.replace(/<[^>]*>/g, '').trim();
  if (textContent.length > 0 && textContent.length < 50) {
    nudges.push({ id: "body-short", type: "info", message: "Email body seems too short for engagement", field: "body" });
  } else if (textContent.length > 1500) {
    nudges.push({ id: "body-long", type: "info", message: "Long emails may reduce engagement. Consider being more concise.", field: "body" });
  }

  // Success checks
  if (nudges.filter(n => n.type === "error" || n.type === "warning").length === 0) {
    if (subject.length >= 20 && subject.length <= 60) {
      nudges.push({ id: "subject-optimal", type: "success", message: "Subject line length is optimal", field: "subject" });
    }
    if (textContent.length >= 100 && textContent.length <= 500) {
      nudges.push({ id: "body-optimal", type: "success", message: "Email length is optimal for cold outreach", field: "body" });
    }
  }

  return nudges;
};

// Generate email-safe HTML with inline CSS
const generateCleanHtml = (bodyContent: string, organizationName: string, organizationAddress: string): string => {
  const footer = `
    <tr>
      <td style="padding: 24px 32px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
        <div style="margin-bottom: 8px; font-weight: 600; color: #374151;">${organizationName}</div>
        <div style="margin-bottom: 16px;">${organizationAddress}</div>
        <div>
          <a href="{{unsubscribe_url}}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
          <span style="margin: 0 8px; color: #d1d5db;">|</span>
          <a href="{{preferences_url}}" style="color: #6b7280; text-decoration: underline;">Manage Preferences</a>
        </div>
      </td>
    </tr>
  `;

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <title>Email</title>
  <style type="text/css">
    body { margin: 0; padding: 0; }
    table { border-spacing: 0; }
    td { padding: 0; }
    img { border: 0; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 32px; font-size: 16px; line-height: 1.6; color: #1f2937;">
              ${bodyContent}
            </td>
          </tr>
          ${footer}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
  
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const tagName = el.tagName.toLowerCase();
    
    if (tagName === 'table' && el.querySelector('a[href]')) {
      // It's likely a button
      const link = el.querySelector('a');
      blocks.push({
        id: generateBlockId(),
        type: 'button',
        content: link?.textContent || 'Click Here',
        settings: {
          buttonUrl: link?.getAttribute('href') || '#',
          buttonColor: '#2563eb'
        }
      });
    } else if (tagName === 'hr' || el.innerHTML.includes('border-top:')) {
      blocks.push({ id: generateBlockId(), type: 'divider', content: '' });
    } else if (tagName === 'div' && el.getAttribute('style')?.includes('height:')) {
      blocks.push({ id: generateBlockId(), type: 'spacer', content: '' });
    } else if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
      blocks.push({
        id: generateBlockId(),
        type: 'heading',
        content: el.textContent || '',
        settings: { headingLevel: parseInt(tagName[1]) as 1 | 2 | 3 }
      });
    } else if (tagName === 'ul' || tagName === 'ol') {
      const items = Array.from(el.querySelectorAll('li')).map(li => li.textContent).join('\n');
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
        return `<p style="margin: 0 0 16px 0;">${block.content}</p>`;
      case 'heading':
        const level = block.settings?.headingLevel || 2;
        const sizes: Record<number, string> = { 1: '28px', 2: '24px', 3: '20px' };
        return `<h${level} style="margin: 0 0 16px 0; font-size: ${sizes[level]}; font-weight: 600; color: #111827;">
          ${block.content}
        </h${level}>`;
      case 'button':
        return `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
  <tr>
    <td style="background-color: ${block.settings?.buttonColor || '#2563eb'}; border-radius: 6px;">
      <a href="${block.settings?.buttonUrl || '#'}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px;">
        ${block.content}
      </a>
    </td>
  </tr>
</table>`;
      case 'image':
        return `<img src="${block.settings?.imageUrl || ''}" alt="${block.settings?.imageAlt || ''}" style="max-width: 100%; height: auto; margin: 16px 0; border-radius: 4px;" />`;
      case 'divider':
        return '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />';
      case 'spacer':
        return '<div style="height: 24px;"></div>';
      case 'list':
        const listTag = block.settings?.listType === 'numbered' ? 'ol' : 'ul';
        const items = block.content.split('\n').filter(Boolean).map(item => `<li style="margin-bottom: 8px;">${item}</li>`).join('');
        return `<${listTag} style="margin: 0 0 16px 0; padding-left: 24px;">${items}</${listTag}>`;
      default:
        return block.content;
    }
  }).join('\n');
};

// Personalization tokens
const PERSONALIZATION_TOKENS = [
  { token: "{{first_name}}", label: "First Name", icon: User },
  { token: "{{last_name}}", label: "Last Name", icon: User },
  { token: "{{company}}", label: "Company", icon: Building2 },
  { token: "{{email}}", label: "Email", icon: AtSign },
  { token: "{{job_title}}", label: "Job Title", icon: User },
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

const BRAND_COLOR_PRESETS: Record<BrandPaletteKey, {
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  button: string;
}> = {
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
<script>
(function() {
  function findBlock(el) {
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.block) return el.dataset.block;
      el = el.parentElement;
    }
    return null;
  }
  document.addEventListener('click', function(event) {
    var block = findBlock(event.target);
    window.parent.postMessage({ type: 'ai-template-click', block: block || null }, '*');
  });
})();
</script>`;
  const bodyClose = /<\/body>/i;
  if (bodyClose.test(html)) {
    return html.replace(bodyClose, `${script}</body>`);
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
  
  // Core state - use htmlContent if bodyContent is empty (for edit mode compatibility)
  const initialBodyContent = initialTemplate?.bodyContent || initialTemplate?.htmlContent || "";
  const initialIsBrandedTemplate = Boolean(
    initialBodyContent &&
      (initialBodyContent.includes("box-shadow: 0 20px 60px") ||
        initialBodyContent.includes("demangent-logo") ||
        initialBodyContent.includes("<!DOCTYPE html"))
  );
  const [subject, setSubject] = useState(campaignIntent.subject);
  const [preheader, setPreheader] = useState(initialTemplate?.preheader || "");
  const [bodyContent, setBodyContent] = useState(initialBodyContent);
  const [editorMode, setEditorMode] = useState<"visual" | "code" | "html">(
    "visual"  // Always start in visual mode for better UX
  );
  const [useBrandedTemplate, setUseBrandedTemplate] = useState(initialIsBrandedTemplate);
  
  // Visual editor block state
  const [blocks, setBlocks] = useState<ContentBlock[]>(() => 
    parseHtmlToBlocks(initialBodyContent)
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  
  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<"gmail-desktop" | "gmail-mobile" | "outlook" | "plaintext">("gmail-desktop");
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  
  // AI Assistant state
  const [outreachType, setOutreachType] = useState("cold-outreach");
  const [tone, setTone] = useState("professional");
  const [aiContext, setAiContext] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [ctaUrl, setCtaUrl] = useState("https://example.com");
  const [brandPalette, setBrandPalette] = useState<BrandPaletteKey>("indigo");
  const [useCustomBrandColors, setUseCustomBrandColors] = useState(false);
  const [brandColors, setBrandColors] = useState(BRAND_COLOR_PRESETS.indigo);
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(false);
  const [selectedMergeToken, setSelectedMergeToken] = useState<string | undefined>(undefined);

  const htmlEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const activeEditorRef = useRef<{
    type: "block" | "body";
    blockId?: string;
    field?: "content" | "buttonUrl";
    selectionStart?: number;
    selectionEnd?: number;
  } | null>(null);
  
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
    if (!useCustomBrandColors) {
      setBrandColors(BRAND_COLOR_PRESETS[brandPalette]);
    }
  }, [brandPalette, useCustomBrandColors]);

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
      const typeMap: Record<string, BlockType> = {
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
  
  // Generate full HTML
  const fullHtml = useMemo(() => {
    if (useBrandedTemplate) {
      return bodyContent;
    }
    return generateCleanHtml(bodyContent, organizationName, organizationAddress);
  }, [bodyContent, organizationName, organizationAddress, useBrandedTemplate]);

  const brandedPreviewHtml = useMemo(() => {
    if (!useBrandedTemplate) return bodyContent;
    return injectClickCaptureScript(bodyContent);
  }, [bodyContent, useBrandedTemplate]);
  
  // Generate plain text version
  const plainTextVersion = useMemo(() => {
    let text = bodyContent
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<li>/gi, "• ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, "$2 ($1)")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    
    if (!useBrandedTemplate) {
      text += `\n\n---\n${organizationName}\n${organizationAddress}\n\nUnsubscribe: {{unsubscribe_url}}`;
    }
    return text;
  }, [bodyContent, organizationName, organizationAddress, useBrandedTemplate]);
  
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
  
  const updateBlock = useCallback((id: string, updates: Partial<ContentBlock>) => {
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
<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
  <tr>
    <td style="background-color: #2563eb; border-radius: 6px;">
      <a href="${resolvedCtaUrl}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px;">
        Click Here
      </a>
    </td>
  </tr>
</table>`;
      setBodyContent(prev => prev + ctaHtml);
    }
  }, [editorMode, selectedBlockId, addBlock, ctaUrl]);
  
  // Insert divider
  const insertDivider = useCallback(() => {
    if (editorMode === 'visual') {
      addBlock('divider', selectedBlockId || undefined);
    } else {
      setBodyContent(prev => prev + '\n<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />\n');
    }
  }, [editorMode, selectedBlockId, addBlock]);
  
  // Insert spacer
  const insertSpacer = useCallback(() => {
    if (editorMode === 'visual') {
      addBlock('spacer', selectedBlockId || undefined);
    } else {
      setBodyContent(prev => prev + '\n<div style="height: 24px;"></div>\n');
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
            content: `<strong>${campaignIntent.senderName}</strong><br/><span style="color: #6b7280; font-size: 14px;">${campaignIntent.fromEmail}</span>`
          } : b);
        }
        return prev;
      });
    } else {
      const signature = `
<div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
  <p style="margin: 0; font-weight: 600; color: #374151;">${campaignIntent.senderName}</p>
  <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">${campaignIntent.fromEmail}</p>
</div>`;
      setBodyContent(prev => prev + signature);
    }
  }, [editorMode, selectedBlockId, addBlock, campaignIntent]);
  
  // AI Generate Email
  const handleAiGenerate = async () => {
    setAiGenerating(true);
    const buildCopy = (overrides: Partial<EmailTemplateCopy> = {}): EmailTemplateCopy => {
      const fallbackBullets = [
        "Clear value tailored to your team.",
        "Fast setup with measurable impact.",
        "Support from our team end to end."
      ];
      const bullets = Array.isArray(overrides.valueBullets)
        ? overrides.valueBullets.filter(Boolean)
        : [];
      while (bullets.length < 3) {
        bullets.push(fallbackBullets[bullets.length] || fallbackBullets[0]);
      }
      const fallbackIntro = aiContext
        ? `Hi {{first_name}},\n\n${aiContext}\n\nWould you be open to a brief conversation next week?`
        : `Hi {{first_name}},\n\nI wanted to reach out about ${campaignIntent.campaignName}. I believe there is a strong opportunity to help your team achieve its goals.\n\nWould you be open to a brief conversation next week?`;

      return {
        subject: overrides.subject || subject || `Quick question about ${campaignIntent.campaignName}`,
        preheader: overrides.preheader || preheader || `A quick note about ${campaignIntent.campaignName}`,
        heroTitle: overrides.heroTitle || campaignIntent.campaignName || "Quick question",
        heroSubtitle: overrides.heroSubtitle || "A short note from our team",
        intro: overrides.intro || fallbackIntro,
        valueBullets: bullets,
        ctaLabel: overrides.ctaLabel || "Schedule a quick call",
        closingLine: overrides.closingLine || `Thanks, ${campaignIntent.senderName}`,
        ctaUrl: overrides.ctaUrl || (ctaUrl?.trim() ? ctaUrl.trim() : "https://example.com")
      };
    };

    const applyBrandedTemplate = (copy: EmailTemplateCopy) => {
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
        companyName: organizationName,
        companyAddress: organizationAddress,
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

    try {
      const res = await apiRequest("POST", "/api/ai/generate-email", {
        campaignName: campaignIntent.campaignName,
        outreachType,
        tone,
        context: aiContext,
        senderName: campaignIntent.senderName,
        companyName: organizationName,
        ctaUrl: ctaUrl?.trim() ? ctaUrl.trim() : undefined,
        brandPalette
      });
      const data = await res.json();
      const copy = buildCopy(data?.rawContent || data?.content || {});
      applyBrandedTemplate(copy);
      toast({
        title: data?.usedAi ? "Email generated" : "Template generated",
        description: data?.usedAi
          ? "Review and customize the AI-generated template"
          : "AI unavailable - using branded template"
      });
    } catch (error) {
      const copy = buildCopy();
      applyBrandedTemplate(copy);
      toast({
        title: "Template generated",
        description: "AI unavailable - using branded template"
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
      htmlContent: fullHtml
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
        htmlContent: fullHtml
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
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-slate-50">
        {/* Top Bar - Sticky */}
        <div className="border-b bg-white px-4 py-3 flex items-center justify-between shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Back Button */}
            <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-600">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Campaign
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* Campaign Name Badge */}
            <Badge variant="secondary" className="text-xs font-medium">
              {campaignIntent.campaignName}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(true)}>
              <Eye className="w-4 h-4 mr-1" />
              Preview
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Button variant="outline" size="sm" onClick={handleSave}>
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave}
              disabled={hasErrors}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Send className="w-4 h-4 mr-1" />
              Save & Continue
            </Button>
          </div>
        </div>
        
        {/* Subject & Preheader Row */}
        <div className="border-b bg-white px-6 py-3 flex-shrink-0">
          <div className="max-w-4xl mx-auto space-y-3">
            {/* Subject Line */}
            <div className="flex items-center gap-4">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Write a compelling subject line..."
                className="text-base font-medium border-0 bg-transparent px-2 h-10 flex-1 focus-visible:ring-1 focus-visible:ring-blue-500"
              />
              <span className={`text-xs whitespace-nowrap ${subject.length > 60 ? 'text-amber-600' : 'text-slate-400'}`}>
                {subject.length}/60
              </span>
            </div>
            
            {/* Preheader */}
            <div className="flex items-center gap-4">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Preview</Label>
              <Input
                value={preheader}
                onChange={(e) => setPreheader(e.target.value)}
                placeholder="Preview text shows after subject in inbox..."
                className="text-sm border-0 bg-transparent px-2 h-8 flex-1 focus-visible:ring-1 focus-visible:ring-blue-500"
              />
              <span className="text-xs text-slate-400 whitespace-nowrap">{preheader.length}/150</span>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Main Canvas (70% width) */}
          <div className="flex-1 flex flex-col min-h-0 p-6">
            {/* Editor Mode Toggle */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 bg-white rounded-lg p-1 shadow-sm border">
                <Button
                  variant={editorMode === "visual" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setEditorMode("visual")}
                  className="text-xs"
                >
                  <Type className="w-3.5 h-3.5 mr-1" />
                  Visual
                </Button>
                <Button
                  variant={editorMode === "code" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setEditorMode("code")}
                  className="text-xs"
                >
                  <Code2 className="w-3.5 h-3.5 mr-1" />
                  HTML
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCanvasExpanded(prev => !prev)}
                  className="text-xs"
                >
                  {isCanvasExpanded ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5 mr-1" />
                      Compact
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5 mr-1" />
                      Full width
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Email Canvas Container */}
            <div className="flex-1 flex justify-center overflow-auto pb-4">
              <div className={`w-full ${isCanvasExpanded ? "max-w-[1100px]" : "max-w-[600px]"}`}>
                {/* Email Container */}
                <div className="bg-white rounded-lg shadow-lg border overflow-hidden">
                  {editorMode === "visual" ? (
                    useBrandedTemplate ? (
                      /* Full HTML Preview for AI-generated branded templates */
                      <div className="min-h-[500px] relative">
                        <div className="absolute top-2 left-2 right-2 z-10 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex items-center justify-between gap-2 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-500" />
                            <span className="font-medium">AI-generated branded template</span>
                            <span className="text-[11px] text-blue-700">Click a section to edit in Visual mode</span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditorMode("html")}
                            className="text-xs bg-white hover:bg-blue-50"
                          >
                            <Code2 className="w-3 h-3 mr-1" />
                            Edit HTML Code
                          </Button>
                        </div>
                        <iframe
                          srcDoc={brandedPreviewHtml}
                          className={`w-full border-0 pt-12 ${isCanvasExpanded ? "min-h-[720px]" : "min-h-[600px]"}`}
                          style={{ background: '#f3f4f6' }}
                          title="Email Preview"
                          sandbox="allow-same-origin"
                        />
                      </div>
                    ) : (
                    <div className="min-h-[500px] p-6" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                      {/* Visual Block Editor */}
                      <div className="space-y-2">
                        {blocks.map((block, index) => (
                          <div
                            key={block.id}
                            draggable
                            onDragStart={(e) => {
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
                            className={`group relative rounded-lg transition-all cursor-move ${
                              selectedBlockId === block.id ? 'ring-2 ring-blue-500 ring-offset-2' : 'hover:ring-2 hover:ring-slate-200'
                            } ${dragOverBlockId === block.id ? 'border-t-4 border-blue-500' : ''} ${
                              draggedBlockId === block.id ? 'opacity-50' : ''
                            }`}
                          >
                            {/* Drag Handle & Actions */}
                            <div className={`absolute -left-8 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${selectedBlockId === block.id ? 'opacity-100' : ''}`}>
                              <div className="p-1 bg-white border rounded shadow-sm cursor-grab active:cursor-grabbing">
                                <GripVertical className="w-3 h-3 text-slate-400" />
                              </div>
                            </div>
                            
                            {/* Delete Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBlock(block.id);
                              }}
                              className={`absolute -right-2 -top-2 p-1 bg-red-500 text-white rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 ${selectedBlockId === block.id ? 'opacity-100' : ''}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                            
                            {/* Block Content Rendering */}
                            <div className="p-2">
                              {/* Text Block */}
                              {block.type === 'text' && (
                                editingBlockId === block.id ? (
                                  <Textarea
                                    autoFocus
                                    value={block.content}
                                    onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                                    onBlur={() => setEditingBlockId(null)}
                                    onFocus={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onClick={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onKeyUp={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onSelect={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    placeholder="Type your text here..."
                                    className="w-full min-h-[60px] text-base leading-relaxed border-0 resize-none focus-visible:ring-0 p-0 bg-transparent"
                                  />
                                ) : (
                                  <div 
                                    className="text-base leading-relaxed text-gray-800 min-h-[24px]"
                                    dangerouslySetInnerHTML={{ __html: block.content || '<span class="text-slate-400">Click to add text...</span>' }}
                                  />
                                )
                              )}
                              
                              {/* Heading Block */}
                              {block.type === 'heading' && (
                                editingBlockId === block.id ? (
                                  <Input
                                    autoFocus
                                    value={block.content}
                                    onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                                    onBlur={() => setEditingBlockId(null)}
                                    onFocus={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onClick={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onKeyUp={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onSelect={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onKeyDown={(e) => e.key === 'Enter' && setEditingBlockId(null)}
                                    placeholder="Enter heading..."
                                    className={`w-full border-0 p-0 bg-transparent focus-visible:ring-0 font-semibold ${
                                      block.settings?.headingLevel === 1 ? 'text-3xl' : 
                                      block.settings?.headingLevel === 3 ? 'text-xl' : 'text-2xl'
                                    }`}
                                  />
                                ) : (
                                  <div className={`font-semibold text-gray-900 ${
                                    block.settings?.headingLevel === 1 ? 'text-3xl' : 
                                    block.settings?.headingLevel === 3 ? 'text-xl' : 'text-2xl'
                                  }`}>
                                    {block.content || <span className="text-slate-400">Click to add heading...</span>}
                                  </div>
                                )
                              )}
                              
                              {/* Button Block */}
                              {block.type === 'button' && (
                                <div className="py-2">
                                  {editingBlockId === block.id ? (
                                    <div className="space-y-2">
                                      <Input
                                        autoFocus
                                        value={block.content}
                                        onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                                        onFocus={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                        onClick={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                        onKeyUp={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                        onSelect={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                        placeholder="Button text..."
                                        className="text-sm"
                                      />
                                      <Input
                                        value={block.settings?.buttonUrl || ''}
                                        onChange={(e) => updateBlock(block.id, { settings: { ...block.settings, buttonUrl: e.target.value } })}
                                        onFocus={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "buttonUrl" }, e.currentTarget)}
                                        onClick={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "buttonUrl" }, e.currentTarget)}
                                        onKeyUp={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "buttonUrl" }, e.currentTarget)}
                                        onSelect={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "buttonUrl" }, e.currentTarget)}
                                        onBlur={() => setEditingBlockId(null)}
                                        placeholder="https://..."
                                        className="text-sm"
                                      />
                                    </div>
                                  ) : (
                                    <div
                                      className="inline-block px-6 py-3 text-white font-semibold rounded-md text-sm"
                                      style={{ backgroundColor: block.settings?.buttonColor || '#2563eb' }}
                                    >
                                      {block.content || 'Click Here'}
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {/* Image Block */}
                              {block.type === 'image' && (
                                <div className="py-2">
                                  {block.settings?.imageUrl ? (
                                    <img 
                                      src={block.settings.imageUrl} 
                                      alt={block.settings.imageAlt || ''} 
                                      className="max-w-full h-auto rounded"
                                    />
                                  ) : (
                                    <div 
                                      className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
                                      onClick={() => {
                                        const url = prompt('Enter image URL:');
                                        if (url) {
                                          updateBlock(block.id, { settings: { ...block.settings, imageUrl: url } });
                                        }
                                      }}
                                    >
                                      <Image className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                                      <p className="text-sm text-slate-500">Click to add image URL</p>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {/* Divider Block */}
                              {block.type === 'divider' && (
                                <hr className="border-t border-slate-300 my-4" />
                              )}
                              
                              {/* Spacer Block */}
                              {block.type === 'spacer' && (
                                <div className="h-8 bg-slate-50 rounded border border-dashed border-slate-200 flex items-center justify-center">
                                  <span className="text-xs text-slate-400">Spacer</span>
                                </div>
                              )}
                              
                              {/* List Block */}
                              {block.type === 'list' && (
                                editingBlockId === block.id ? (
                                  <Textarea
                                    autoFocus
                                    value={block.content}
                                    onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                                    onBlur={() => setEditingBlockId(null)}
                                    onFocus={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onClick={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onKeyUp={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onSelect={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    placeholder="Enter items, one per line..."
                                    className="w-full min-h-[80px] text-base leading-relaxed border-0 resize-none focus-visible:ring-0 p-0 bg-transparent"
                                  />
                                ) : (
                                  block.settings?.listType === 'numbered' ? (
                                    <ol className="list-decimal list-inside space-y-1 text-gray-800">
                                      {block.content.split('\n').filter(Boolean).map((item, i) => (
                                        <li key={i}>{item}</li>
                                      ))}
                                    </ol>
                                  ) : (
                                    <ul className="list-disc list-inside space-y-1 text-gray-800">
                                      {block.content.split('\n').filter(Boolean).map((item, i) => (
                                        <li key={i}>{item}</li>
                                      ))}
                                    </ul>
                                  )
                                )
                              )}
                            </div>
                          </div>
                        ))}
                        
                        {/* Add Block Button */}
                        <div className="pt-4 flex justify-center">
                          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addBlock('text')}
                                  className="h-8 px-2"
                                >
                                  <Type className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Add Text</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addBlock('heading')}
                                  className="h-8 px-2"
                                >
                                  <Bold className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Add Heading</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addBlock('button')}
                                  className="h-8 px-2"
                                >
                                  <MousePointer className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Add Button</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addBlock('image')}
                                  className="h-8 px-2"
                                >
                                  <Image className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Add Image</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addBlock('list')}
                                  className="h-8 px-2"
                                >
                                  <List className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Add List</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addBlock('divider')}
                                  className="h-8 px-2"
                                >
                                  <Minus className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Add Divider</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </div>
                    )
                  ) : (
                    <div className="min-h-[500px] relative">
                      {/* Show back to preview button for branded templates */}
                      {useBrandedTemplate && (
                        <div className="absolute top-2 left-2 right-2 z-10 bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-lg p-3 text-sm text-slate-200 flex items-center justify-between gap-2 shadow-lg">
                          <div className="flex items-center gap-2">
                            <Code2 className="w-4 h-4 text-green-400" />
                            <span className="font-medium">Editing HTML - Changes will update the preview</span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditorMode("visual")}
                            className="text-xs bg-slate-600 border-slate-500 text-white hover:bg-slate-500"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Preview
                          </Button>
                        </div>
                      )}
                      <Textarea
                        ref={htmlEditorRef}
                        value={bodyContent}
                        onChange={(e) => setBodyContent(e.target.value)}
                        onFocus={(e) => captureEditorSelection({ type: "body" }, e.currentTarget)}
                        onClick={(e) => captureEditorSelection({ type: "body" }, e.currentTarget)}
                        onKeyUp={(e) => captureEditorSelection({ type: "body" }, e.currentTarget)}
                        onSelect={(e) => captureEditorSelection({ type: "body" }, e.currentTarget)}
                        placeholder="Enter HTML content..."
                        className={`w-full min-h-[500px] p-4 font-mono text-sm border-0 resize-none focus-visible:ring-0 bg-slate-900 text-green-400 ${useBrandedTemplate ? 'pt-16' : ''}`}
                      />
                    </div>
                  )}
                  
                  {/* Auto-injected Footer Preview - Only show for non-branded templates */}
                  {!useBrandedTemplate && (
                    <div className="border-t bg-slate-50 p-4 text-center text-xs text-slate-500">
                      <div className="font-semibold text-slate-600 mb-1">{organizationName}</div>
                      <div className="mb-2">{organizationAddress}</div>
                      <div className="text-slate-400">
                        <span className="underline cursor-default">Unsubscribe</span>
                        <span className="mx-2">|</span>
                        <span className="underline cursor-default">Manage Preferences</span>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-400 italic">
                        ↑ Auto-injected at send time (not editable)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Components & AI */}
          <div className="w-80 border-l bg-white flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                {/* A. Components (Drag & Drop) */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MousePointer className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold text-slate-700">Components</h3>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">Click to insert ESP-safe elements</p>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => insertToken(" ")}
                      className="h-10 justify-start text-xs"
                    >
                      <Type className="w-3.5 h-3.5 mr-2" />
                      Text
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={insertCtaButton}
                      className="h-10 justify-start text-xs"
                    >
                      <MousePointer className="w-3.5 h-3.5 mr-2" />
                      Button
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={insertDivider}
                      className="h-10 justify-start text-xs"
                    >
                      <Minus className="w-3.5 h-3.5 mr-2" />
                      Divider
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={insertSpacer}
                      className="h-10 justify-start text-xs"
                    >
                      <MoveVertical className="w-3.5 h-3.5 mr-2" />
                      Spacer
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={insertSignature}
                      className="h-10 justify-start text-xs col-span-2"
                    >
                      <PenLine className="w-3.5 h-3.5 mr-2" />
                      Signature Block
                    </Button>
                  </div>
                  
                  <p className="text-[10px] text-slate-400 mt-2 italic">
                    No fancy blocks. No heavy layouts. Everything ESP-safe.
                  </p>
                </div>

                <Separator />

                {/* B. AI Assistant (Always Visible) */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    <h3 className="text-sm font-semibold text-slate-700">AI Assistant</h3>
                  </div>
                  
                  <div className="space-y-3">
                    {/* Outreach Type */}
                    <div>
                      <Label className="text-xs text-slate-500 mb-1.5 block">Outreach Type</Label>
                      <Select value={outreachType} onValueChange={setOutreachType}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OUTREACH_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value} className="text-xs">
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Tone */}
                    <div>
                      <Label className="text-xs text-slate-500 mb-1.5 block">Tone</Label>
                      <Select value={tone} onValueChange={setTone}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TONE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Context */}
                    <div>
                      <Label className="text-xs text-slate-500 mb-1.5 block">Context (optional)</Label>
                      <Textarea
                        value={aiContext}
                        onChange={(e) => setAiContext(e.target.value)}
                        placeholder="Add details about the audience, pain points, proof, and desired CTA..."
                        className="text-xs min-h-[140px] resize-none"
                        rows={6}
                      />
                    </div>

                    {/* CTA URL */}
                    <div>
                      <Label className="text-xs text-slate-500 mb-1.5 block">CTA URL</Label>
                      <Input
                        value={ctaUrl}
                        onChange={(e) => setCtaUrl(e.target.value)}
                        placeholder="https://..."
                        className="text-xs h-9"
                      />
                    </div>

                    {/* Brand Palette */}
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-500 block">Brand Palette</Label>
                      <Select value={brandPalette} onValueChange={(value) => setBrandPalette(value as BrandPaletteKey)}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BRAND_PALETTE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option} className="text-xs">
                              {option.charAt(0).toUpperCase() + option.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant={useCustomBrandColors ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => setUseCustomBrandColors(prev => !prev)}
                        className="w-full text-xs"
                      >
                        <Palette className="w-3.5 h-3.5 mr-2" />
                        {useCustomBrandColors ? "Using custom colors" : "Customize brand colors"}
                      </Button>
                      {useCustomBrandColors && (
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { key: "primary", label: "Primary" },
                            { key: "secondary", label: "Secondary" },
                            { key: "accent", label: "Accent" },
                            { key: "surface", label: "Surface" },
                            { key: "button", label: "Button" }
                          ] as const).map(({ key, label }) => (
                            <div key={key} className="space-y-1">
                              <Label className="text-[10px] text-slate-500">{label}</Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="color"
                                  value={brandColors[key]}
                                  onChange={(e) => updateBrandColor(key, e.target.value)}
                                  className="h-8 w-10 p-1"
                                />
                                <Input
                                  value={brandColors[key]}
                                  onChange={(e) => updateBrandColor(key, e.target.value)}
                                  className="text-[10px] h-8"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Generate Button */}
                    <Button
                      onClick={handleAiGenerate}
                      disabled={aiGenerating}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {aiGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Email
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Smart Insights */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-semibold text-slate-700">Smart Insights</h3>
                  </div>
                  
                  {nudges.length === 0 ? (
                    <div className="text-xs text-slate-500 p-3 bg-slate-50 rounded-lg">
                      Start writing to see deliverability insights
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {nudges.map((nudge) => (
                        <div
                          key={nudge.id}
                          className={`text-xs p-2.5 rounded-lg flex items-start gap-2 ${
                            nudge.type === "error" ? "bg-red-50 text-red-700 border border-red-200" :
                            nudge.type === "warning" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                            nudge.type === "success" ? "bg-green-50 text-green-700 border border-green-200" :
                            "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}
                        >
                          {nudge.type === "error" && <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                          {nudge.type === "warning" && <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                          {nudge.type === "success" && <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                          {nudge.type === "info" && <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                          <span>{nudge.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Variables */}
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full">
                    <ChevronDown className="w-4 h-4 text-slate-400 transition-transform [[data-state=closed]_&]:-rotate-90" />
                    <AtSign className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold text-slate-700">Variables</h3>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <div className="space-y-2">
                      <Select
                        value={selectedMergeToken}
                        onValueChange={(value) => {
                          setSelectedMergeToken(undefined);
                          insertToken(value);
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Insert merge field at cursor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PERSONALIZATION_TOKENS.map((item) => (
                            <SelectItem key={item.token} value={item.token} className="text-xs">
                              {item.label} {item.token}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-slate-400">
                        Click inside the editor first to insert at the cursor.
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                {/* Test Email */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Send className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold text-slate-700">Send Test</h3>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="test@example.com"
                      className="text-xs h-8"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSendTest}
                      disabled={!testEmail.trim() || sendingTest}
                      className="h-8 px-3"
                    >
                      {sendingTest ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Preview Modal */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Email Preview</DialogTitle>
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                  <Button
                    variant={previewMode === "gmail-desktop" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setPreviewMode("gmail-desktop")}
                    className="text-xs"
                  >
                    <Monitor className="w-3.5 h-3.5 mr-1" />
                    Gmail
                  </Button>
                  <Button
                    variant={previewMode === "gmail-mobile" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setPreviewMode("gmail-mobile")}
                    className="text-xs"
                  >
                    <Smartphone className="w-3.5 h-3.5 mr-1" />
                    Mobile
                  </Button>
                  <Button
                    variant={previewMode === "outlook" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setPreviewMode("outlook")}
                    className="text-xs"
                  >
                    <Mail className="w-3.5 h-3.5 mr-1" />
                    Outlook
                  </Button>
                  <Button
                    variant={previewMode === "plaintext" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setPreviewMode("plaintext")}
                    className="text-xs"
                  >
                    <FileText className="w-3.5 h-3.5 mr-1" />
                    Plain Text
                  </Button>
                </div>
              </div>
              <DialogDescription className="sr-only">
                Preview your email template across different email clients.
              </DialogDescription>
            </DialogHeader>
            
            {/* Email Header Preview */}
            <div className="border-b pb-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="font-medium">From:</span>
                <span>{campaignIntent.senderName} &lt;{campaignIntent.fromEmail}&gt;</span>
              </div>
              <div>
                <span className="text-xs text-slate-500">Subject:</span>
                <p className="font-medium">{subject || "(No subject)"}</p>
              </div>
              {preheader && (
                <div>
                  <span className="text-xs text-slate-500">Preview:</span>
                  <p className="text-sm text-slate-600">{preheader}</p>
                </div>
              )}
            </div>
            
            {/* Preview Frame */}
            <div className="flex-1 overflow-hidden bg-slate-100 rounded-lg flex items-center justify-center p-4">
              {previewMode === "plaintext" ? (
                <div className="w-full h-full bg-white rounded border overflow-auto p-6">
                  <pre className="text-sm whitespace-pre-wrap font-mono text-slate-700">
                    {plainTextVersion}
                  </pre>
                </div>
              ) : (
                <div
                  className={`bg-white shadow-xl overflow-hidden rounded-lg h-full ${
                    previewMode === "gmail-mobile" ? "w-[375px]" : "w-full max-w-[700px]"
                  }`}
                >
                  {/* Simulated Email Client Header */}
                  <div className={`border-b px-4 py-3 ${
                    previewMode === "outlook" ? "bg-[#0078d4]" : "bg-white"
                  }`}>
                    <div className={`text-xs ${previewMode === "outlook" ? "text-white" : "text-slate-500"}`}>
                      {previewMode === "outlook" ? "Microsoft Outlook" : "Gmail"}
                    </div>
                  </div>
                  
                  <div className="h-[calc(100%-52px)] overflow-y-auto">
                    <iframe
                      title="Email Preview"
                      srcDoc={fullHtml}
                      className="w-full h-full border-0"
                    />
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

export default SimpleTemplateBuilder;
