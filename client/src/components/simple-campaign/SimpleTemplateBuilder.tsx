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
  campaignOrganizationId?: string;
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

const looksLikeHtmlFragment = (value: string) => /<\w+[^>]*>/.test(value);

const normalizePlainTextToHtml = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, "<br />"))
    .join("</p><p>");
  return `<p>${paragraphs}</p>`;
};

const ensureHtmlBody = (value: string) =>
  looksLikeHtmlFragment(value) ? value : normalizePlainTextToHtml(value);

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
    p { margin: 0 0 16px 0; }
    h1, h2, h3 { margin: 0 0 16px 0; font-weight: 600; color: #111827; }
    h1 { font-size: 28px; }
    h2 { font-size: 24px; }
    h3 { font-size: 20px; }
    ul, ol { margin: 0 0 16px 0; padding-left: 24px; }
    li { margin: 0 0 8px 0; }
    a { color: #2563eb; text-decoration: underline; }
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
      let href = link?.getAttribute('href') || '#';
      let prefillEnabled = false;

      if (href.includes(PREFILL_QUERY)) {
        prefillEnabled = true;
        // Try to remove with preceding ? or &
        href = href.replace(`&${PREFILL_QUERY}`, '').replace(`?${PREFILL_QUERY}`, '');
      }

      blocks.push({
        id: generateBlockId(),
        type: 'button',
        content: link?.textContent || 'Click Here',
        settings: {
          buttonUrl: href,
          buttonColor: '#2563eb',
          prefillEnabled
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
        let btnUrl = block.settings?.buttonUrl || '#';
        if (block.settings?.prefillEnabled && btnUrl !== '#') {
          const separator = btnUrl.includes('?') ? '&' : '?';
          btnUrl = `${btnUrl}${separator}${PREFILL_QUERY}`;
        }
        return `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
  <tr>
    <td style="background-color: ${block.settings?.buttonColor || '#2563eb'}; border-radius: 6px;">
      <a href="${btnUrl}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px;">
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
  
  // Organization state overrides
  const [orgName, setOrgName] = useState(organizationName);
  const [orgAddress, setOrgAddress] = useState(organizationAddress);

  // Organization branding colors (loaded from campaign org)
  const [orgBrandColors, setOrgBrandColors] = useState<{
    primary: string;
    secondary: string;
  } | null>(null);
  const [orgBrandLoading, setOrgBrandLoading] = useState(false);
  const [useOrgBrand, setUseOrgBrand] = useState(false);

  // Core state - use htmlContent if bodyContent is empty (for edit mode compatibility)
  const initialBodyContent = initialTemplate?.bodyContent || initialTemplate?.htmlContent || "";
  const initialIsBrandedTemplate = Boolean(
    initialBodyContent &&
      (initialBodyContent.includes("box-shadow: 0 20px 60px") ||
        initialBodyContent.includes("demangent-logo") ||
        initialBodyContent.includes("<!DOCTYPE html"))
  );
  const [subject, setSubject] = useState(campaignIntent.subject);
  const [preheader, setPreheader] = useState(initialTemplate?.preheader || campaignIntent.preheader || "");
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
  const [previewMode, setPreviewMode] = useState<"gmail-desktop" | "gmail-mobile" | "outlook">("gmail-desktop");
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  
  // AgentX state
  const [outreachType, setOutreachType] = useState("cold-outreach");
  const [tone, setTone] = useState("professional");
  // Pre-populate context with project details when available
  const [aiContext, setAiContext] = useState(() => {
    const parts: string[] = [];
    if (campaignIntent.projectName) parts.push(`Project: ${campaignIntent.projectName}`);
    if (campaignIntent.projectDescription) parts.push(campaignIntent.projectDescription);
    if (campaignIntent.clientName) parts.push(`Client: ${campaignIntent.clientName}`);
    return parts.join("\n\n");
  });
  const [aiGenerating, setAiGenerating] = useState(false);
  const [ctaUrl, setCtaUrl] = useState("https://example.com");
  const [brandPalette, setBrandPalette] = useState<BrandPaletteKey>("indigo");
  const [useCustomBrandColors, setUseCustomBrandColors] = useState(false);
  const [brandColors, setBrandColors] = useState(BRAND_COLOR_PRESETS.indigo);
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(true);
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
        const branding = org.branding || {};
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
        if (org.name && org.name !== organizationName) {
          setOrgName(org.name);
        }
        // Update tone from branding if available
        if (branding.tone) {
          const toneMap: Record<string, string> = {
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
        ? `Hi {{firstName}},\n\n${aiContext}\n\nWould you be open to a brief conversation next week?`
        : `Hi {{firstName}},\n\nI wanted to reach out about ${campaignIntent.campaignName}. I believe there is a strong opportunity to help your team achieve its goals.\n\nWould you be open to a brief conversation next week?`;

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

    try {
      const res = await apiRequest("POST", "/api/ai/generate-email", {
        campaignName: campaignIntent.campaignName,
        outreachType,
        tone,
        context: aiContext,
        senderName: campaignIntent.senderName,
        companyName: orgName,
        ctaUrl: ctaUrl?.trim() ? ctaUrl.trim() : undefined,
        brandPalette,
        // Project & org context for intelligent email generation
        organizationId: campaignIntent.campaignOrganizationId,
        projectName: campaignIntent.projectName,
        projectDescription: campaignIntent.projectDescription,
        clientName: campaignIntent.clientName,
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
        <div className="border-b bg-white px-4 py-3 flex items-center justify-between shadow-sm flex-shrink-0 z-20">
          <div className="flex items-center gap-3">
            {/* Back Button */}
            <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-600">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Campaign
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* Campaign Name Badge */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs font-medium">
                {campaignIntent.campaignName}
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                Step 2 of 3
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                {routeSummary.provider}
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                {routeSummary.domain}
              </Badge>
            </div>
          </div>
          
          {/* Center Toolbar */}
          <div className="flex items-center gap-2">
            {/* AgentX Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-purple-200 hover:bg-purple-50 hover:text-purple-700">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  AgentX
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[90vw] sm:w-[500px] overflow-y-auto">
                <SheetHeader className="pb-6 border-b">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-100">
                         <Bot className="h-6 w-6 text-purple-600" />
                      </div>
                      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-[2px] border-white bg-green-500 animate-pulse shadow-sm" />
                    </div>
                    <div className="space-y-1">
                      <SheetTitle className="text-left text-lg font-semibold tracking-tight">AgentX</SheetTitle>
                      <SheetDescription className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Content Copilot</SheetDescription>
                    </div>
                  </div>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                  {/* Project Context Banner */}
                  {(campaignIntent.projectName || campaignIntent.clientName) && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 space-y-1">
                      <p className="text-xs font-semibold text-blue-800">Campaign context</p>
                      {campaignIntent.clientName && (
                        <p className="text-xs text-blue-600">Client: {campaignIntent.clientName}</p>
                      )}
                      {campaignIntent.projectName && (
                        <p className="text-xs text-blue-600">Project: {campaignIntent.projectName}</p>
                      )}
                      {campaignIntent.campaignOrganizationId && (
                        <p className="text-xs text-blue-500 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Org intelligence will be used for generation
                        </p>
                      )}
                    </div>
                  )}

                  {/* AI Form */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-500">Outreach Type</Label>
                      <Select value={outreachType} onValueChange={setOutreachType}>
                        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{OUTREACH_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-500">Tone</Label>
                      <Select value={tone} onValueChange={setTone}>
                        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{TONE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-500">Context</Label>
                      <Textarea 
                        value={aiContext} 
                        onChange={e => setAiContext(e.target.value)} 
                        placeholder="Add specific details..." 
                        className="text-xs h-24" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-500">CTA URL</Label>
                      <Input value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} className="text-xs" />
                    </div>
                    
                    {/* Brand Palette */}
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-500 block">Brand Palette</Label>

                      {/* Organization brand colors (auto-loaded) */}
                      {orgBrandColors && (
                        <Button
                          type="button"
                          variant={useOrgBrand ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
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
                          <div className="flex items-center gap-2 w-full">
                            <div className="flex gap-1">
                              <span className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: orgBrandColors.primary }} />
                              <span className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: orgBrandColors.secondary }} />
                            </div>
                            <span>{useOrgBrand ? "Using Organization Colors" : "Apply Organization Colors"}</span>
                          </div>
                        </Button>
                      )}
                      {orgBrandLoading && (
                        <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Loading org brand...
                        </div>
                      )}

                      {/* Preset palette selector */}
                      <Select value={brandPalette} onValueChange={(value) => {
                        setBrandPalette(value as BrandPaletteKey);
                        setUseOrgBrand(false);
                        setUseCustomBrandColors(false);
                      }}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BRAND_PALETTE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option} className="text-xs">
                              <div className="flex items-center gap-2">
                                <div className="flex gap-0.5">
                                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: BRAND_COLOR_PRESETS[option].primary }} />
                                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: BRAND_COLOR_PRESETS[option].secondary }} />
                                </div>
                                {option.charAt(0).toUpperCase() + option.slice(1)}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant={useCustomBrandColors && !useOrgBrand ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => {
                          setUseCustomBrandColors(prev => !prev);
                          setUseOrgBrand(false);
                        }}
                        className="w-full text-xs"
                      >
                        <Palette className="w-3.5 h-3.5 mr-2" />
                        {useCustomBrandColors && !useOrgBrand ? "Using custom colors" : "Customize brand colors"}
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
                                  onChange={(e) => {
                                    updateBrandColor(key, e.target.value);
                                    setUseOrgBrand(false);
                                  }}
                                  className="h-8 w-10 p-1"
                                />
                                <Input
                                  value={brandColors[key]}
                                  onChange={(e) => {
                                    updateBrandColor(key, e.target.value);
                                    setUseOrgBrand(false);
                                  }}
                                  className="text-[10px] h-8"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Active color swatch preview */}
                      <div className="pt-2 border-t border-slate-100">
                        <Label className="text-[10px] text-slate-400 block mb-1.5">Active Colors</Label>
                        <div className="flex items-center gap-1.5">
                          {([
                            { key: "primary" as const, label: "Primary" },
                            { key: "secondary" as const, label: "Secondary" },
                            { key: "accent" as const, label: "Accent" },
                            { key: "button" as const, label: "Button" },
                          ]).map(({ key, label }) => (
                            <div key={key} className="flex flex-col items-center gap-0.5">
                              <span
                                className="w-6 h-6 rounded border border-slate-200"
                                style={{ backgroundColor: brandColors[key] }}
                                title={`${label}: ${brandColors[key]}`}
                              />
                              <span className="text-[8px] text-slate-400">{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <Button onClick={handleAiGenerate} disabled={aiGenerating} className="w-full bg-purple-600 text-white">
                      {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                      Generate Email
                    </Button>
                  </div>
                  
                  <Separator />
                  
                  {/* Smart Insights */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      <h3 className="text-sm font-semibold">Smart Insights</h3>
                    </div>
                    {nudges.length === 0 ? (
                      <div className="text-xs text-slate-500 p-3 bg-slate-50 rounded">Start writing to see insights</div>
                    ) : (
                      <div className="space-y-2">
                        {nudges.map(n => (
                          <div key={n.id} className={`text-xs p-2 rounded border flex gap-2 ${
                            n.type === "error" ? "bg-red-50 text-red-700 border-red-200" :
                            n.type === "warning" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            n.type === "success" ? "bg-green-50 text-green-700 border-green-200" :
                            "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>
                            <Info className="w-3 h-3 mt-0.5" />
                            <span>{n.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* Components Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                   <Plus className="w-4 h-4 text-blue-500" />
                   Tools
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] overflow-y-auto">
                 <SheetHeader>
                   <SheetTitle>Builder Tools</SheetTitle>
                   <SheetDescription>Add blocks and variables.</SheetDescription>
                 </SheetHeader>
                 <div className="mt-6 space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Components</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" onClick={() => insertToken(" ")} className="justify-start"><Type className="w-4 h-4 mr-2"/> Text</Button>
                        <Button variant="outline" size="sm" onClick={insertCtaButton} className="justify-start"><MousePointer className="w-4 h-4 mr-2"/> Button</Button>
                        <Button variant="outline" size="sm" onClick={insertDivider} className="justify-start"><Minus className="w-4 h-4 mr-2"/> Divider</Button>
                        <Button variant="outline" size="sm" onClick={insertSpacer} className="justify-start"><MoveVertical className="w-4 h-4 mr-2"/> Spacer</Button>
                        <Button variant="outline" size="sm" onClick={insertSignature} className="col-span-2 justify-start"><PenLine className="w-4 h-4 mr-2"/> Signature</Button>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Variables</h3>
                      <Select value={selectedMergeToken} onValueChange={(val) => { setSelectedMergeToken(undefined); insertToken(val); }}>
                        <SelectTrigger><SelectValue placeholder="Insert variable..." /></SelectTrigger>
                        <SelectContent>
                          {PERSONALIZATION_TOKENS.map(t => (
                            <SelectItem key={t.token} value={t.token}>{t.label} {t.token}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-slate-400 mt-1">Click in editor to place cursor first.</p>
                    </div>
                 </div>
              </SheetContent>
            </Sheet>

            {/* Settings Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                   <Settings2 className="w-4 h-4 text-slate-500" />
                   Settings
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] overflow-y-auto">
                 <SheetHeader>
                   <SheetTitle>Settings</SheetTitle>
                 </SheetHeader>
                 <div className="mt-6 space-y-6">
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold">Footer Configuration</h3>
                        <div className="space-y-2">
                           <Label>Organization Name</Label>
                           <Input value={orgName} onChange={e => setOrgName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                           <Label>Address</Label>
                           <Input value={orgAddress} onChange={e => setOrgAddress(e.target.value)} />
                        </div>
                    </div>
                    <Separator />
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold">Send Test Email</h3>
                      <div className="flex gap-2">
                        <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="email@example.com" />
                        <Button size="icon" onClick={handleSendTest} disabled={sendingTest}>
                          {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                 </div>
              </SheetContent>
            </Sheet>
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
        <div className="border-b bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-6 py-4 flex-shrink-0">
          <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
              <div className="flex items-center gap-4">
                <Label className="w-20 text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Write a compelling subject line..."
                  className="h-11 flex-1 border-0 bg-transparent px-2 text-base font-medium focus-visible:ring-1 focus-visible:ring-blue-500"
                />
                <span className={`text-xs whitespace-nowrap ${subject.length > 60 ? 'text-amber-600' : 'text-slate-400'}`}>
                  {subject.length}/60
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <Label className="w-20 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</Label>
                <Input
                  value={preheader}
                  onChange={(e) => setPreheader(e.target.value)}
                  placeholder="Preview text shows after subject in inbox..."
                  className="h-9 flex-1 border-0 bg-transparent px-2 text-sm focus-visible:ring-1 focus-visible:ring-blue-500"
                />
                <span className="text-xs text-slate-400 whitespace-nowrap">{preheader.length}/150</span>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Envelope</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{campaignIntent.senderName} &lt;{campaignIntent.fromEmail}&gt;</p>
              <p className="mt-1 text-xs text-slate-500">Replies to {routeSummary.replyTo}</p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-h-0 overflow-hidden bg-slate-50/50">
          <div className="grid h-full gap-6 overflow-hidden px-6 py-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-h-0 flex-col">
            {/* Editor Mode Toggle */}
            <div className="flex items-center justify-between mb-4 max-w-5xl mx-auto w-full">
              <div className="flex items-center gap-2 bg-white rounded-lg p-1 shadow-sm border">
                <Button variant={editorMode === "visual" ? "secondary" : "ghost"} size="sm" onClick={() => setEditorMode("visual")} className="text-xs">
                  <Type className="w-3.5 h-3.5 mr-1" /> Visual
                </Button>
                <Button variant={editorMode === "code" ? "secondary" : "ghost"} size="sm" onClick={() => setEditorMode("code")} className="text-xs">
                  <Code2 className="w-3.5 h-3.5 mr-1" /> HTML
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setIsCanvasExpanded(prev => !prev)} className="text-xs">
                  {isCanvasExpanded ? <Minimize2 className="w-3.5 h-3.5 mr-1" /> : <Maximize2 className="w-3.5 h-3.5 mr-1" />}
                  {isCanvasExpanded ? "Compact" : "Full width"}
                </Button>
              </div>
            </div>

            {/* Email Canvas Container */}
            <div className="flex-1 flex justify-center overflow-auto pb-4">
              <div className={`w-full transition-all duration-300 ${isCanvasExpanded ? "max-w-[1400px]" : "max-w-[800px]"}`}>
                {/* Email Container */}
                <div className="bg-white rounded-lg shadow-lg border overflow-hidden min-h-[600px] flex flex-col">
                  {editorMode === "visual" ? (
                    useBrandedTemplate ? (
                      /* Full HTML Preview for AI-generated branded templates */
                      <div className="relative flex-1">
                        <div className="absolute top-2 left-2 right-2 z-10 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex items-center justify-between gap-2 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-500" />
                            <span className="font-medium">AI-generated branded template</span>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => setEditorMode("html")} className="text-xs bg-white hover:bg-blue-50">
                            <Code2 className="w-3 h-3 mr-1" /> Edit HTML
                          </Button>
                        </div>
                        <iframe
                          srcDoc={sanitizeHtmlForIframePreview(brandedPreviewHtml)}
                          className="w-full h-full border-0 pt-12"
                          style={{ background: '#f3f4f6' }}
                          title="Email Preview"
                          sandbox="allow-same-origin allow-scripts"
                        />
                      </div>
                    ) : (
                    <div className="p-8 flex-1" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                      {/* Visual Block Editor */}
                      <div className="space-y-4">
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
                            className={`group relative rounded-lg transition-all cursor-move border border-transparent hover:border-slate-200 ${
                              selectedBlockId === block.id ? 'ring-2 ring-blue-500 ring-offset-2 border-blue-100 z-10' : ''
                            } ${dragOverBlockId === block.id ? 'border-t-4 border-t-blue-500' : ''} ${
                              draggedBlockId === block.id ? 'opacity-50' : ''
                            }`}
                          >
                            {/* Drag Handle & Actions */}
                            <div className={`absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-1 transition-opacity ${selectedBlockId === block.id || 'group-hover:opacity-100 opacity-0'}`}>
                              <div className="p-1.5 bg-white border rounded shadow-sm cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
                                <GripVertical className="w-4 h-4" />
                              </div>
                            </div>
                            
                            {/* Delete Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBlock(block.id);
                              }}
                              className={`absolute -right-3 -top-3 p-1 bg-red-500 text-white rounded-full shadow-sm transition-opacity hover:bg-red-600 z-20 ${selectedBlockId === block.id || 'group-hover:opacity-100 opacity-0'}`}
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
                                    // Capture events for variable insertion
                                    onFocus={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onClick={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                    onKeyUp={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
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
                                    <div 
                                      className="space-y-2"
                                      onBlur={(e) => {
                                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                          setEditingBlockId(null);
                                        }
                                      }}
                                    >
                                      <Input
                                        autoFocus
                                        value={block.content}
                                        onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                                        onFocus={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                        onClick={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                        onKeyUp={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "content" }, e.currentTarget)}
                                        placeholder="Button text..."
                                        className="text-sm"
                                      />
                                      <Input
                                        value={block.settings?.buttonUrl || ''}
                                        onChange={(e) => updateBlock(block.id, { settings: { ...block.settings, buttonUrl: e.target.value } })}
                                        onFocus={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "buttonUrl" }, e.currentTarget)}
                                        onClick={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "buttonUrl" }, e.currentTarget)}
                                        onKeyUp={(e) => captureEditorSelection({ type: "block", blockId: block.id, field: "buttonUrl" }, e.currentTarget)}
                                        placeholder="https://..."
                                        className="text-sm"
                                      />
                                      <div className="flex items-center space-x-2 pt-1 px-1">
                                        <Checkbox 
                                          id={`prefill-${block.id}`}
                                          checked={block.settings?.prefillEnabled || false}
                                          onCheckedChange={(checked) => updateBlock(block.id, { settings: { ...block.settings, prefillEnabled: checked === true } })}
                                        />
                                        <Label htmlFor={`prefill-${block.id}`} className="text-xs text-slate-500 font-normal cursor-pointer select-none">
                                          Pre-fill landing page fields
                                        </Label>
                                      </div>
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
                        
                        {/* Empty State / Add Hint */}
                        {blocks.length === 0 && (
                          <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                            <MousePointer className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p>Click "Tools" to add content blocks</p>
                          </div>
                        )}
                        
                        {/* Bottom Add Buttons */}
                        <div className="pt-8 flex justify-center opacity-50 hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" onClick={() => addBlock('text')} className="text-slate-400 hover:text-blue-500">
                            <Plus className="w-4 h-4 mr-1" /> Add Text
                          </Button>
                        </div>
                      </div>
                    </div>
                    )
                  ) : (
                    <div className="relative flex-1">
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
                        className={`w-full h-full min-h-[500px] p-4 font-mono text-sm border-0 resize-none focus-visible:ring-0 bg-slate-900 text-green-400 ${useBrandedTemplate ? 'pt-16' : ''}`}
                      />
                    </div>
                  )}
                  
                  {/* Auto-injected Footer Preview */}
                  {!useBrandedTemplate && (
                    <div className="border-t bg-slate-50 p-6 text-center text-xs text-slate-500 mt-auto">
                      <div className="font-semibold text-slate-600 mb-1">{orgName}</div>
                      <div className="mb-2">{orgAddress}</div>
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
          <div className="hidden min-h-0 xl:flex xl:flex-col xl:overflow-hidden">
            <div className="grid min-h-0 gap-4 xl:grid-rows-[auto_auto_minmax(0,1fr)_auto]">
              <Card className="rounded-3xl border-slate-200 shadow-sm">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Unified Email Agent</p>
                      <p className="text-xs leading-5 text-slate-500">
                        Keep the brief aligned to the email agent architecture before generating or refining the template.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-500">Outreach Type</Label>
                      <Select value={outreachType} onValueChange={setOutreachType}>
                        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{OUTREACH_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-500">Tone</Label>
                      <Select value={tone} onValueChange={setTone}>
                        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{TONE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">Unified Brief</Label>
                    <Textarea
                      value={aiContext}
                      onChange={e => setAiContext(e.target.value)}
                      placeholder="Describe goals, pain points, offer, proof, and CTA constraints..."
                      className="min-h-[140px] resize-none text-sm"
                    />
                  </div>

                  <Button onClick={handleAiGenerate} disabled={aiGenerating} className="w-full bg-slate-950 text-white hover:bg-slate-800">
                    {aiGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Generate With Unified Agent
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-slate-200 shadow-sm">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Personalization and CTA</p>
                      <p className="text-xs text-slate-500">Use merge tags and prefilled landing page links without leaving the builder.</p>
                    </div>
                    <Badge variant="outline" className="text-[11px]">{routeSummary.domain}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mergeTokens.map((token) => (
                      <Button key={token} type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => insertToken(token)}>
                        {token}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">CTA URL</Label>
                    <Input value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} className="text-sm" />
                    <p className="text-xs text-slate-500">Enable prefill on CTA blocks to pass first name, last name, company, email, and phone into landing forms.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="min-h-0 rounded-3xl border-slate-200 shadow-sm">
                <CardContent className="flex h-full min-h-0 flex-col p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Live Inbox Preview</p>
                      <p className="text-xs text-slate-500">Keep the email visible while you edit so the full template reads like an inbox artifact, not raw markup.</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                      <Button variant={previewMode === "gmail-desktop" ? "secondary" : "ghost"} size="sm" onClick={() => setPreviewMode("gmail-desktop")} className="text-[11px]">
                        <Monitor className="mr-1 h-3.5 w-3.5" /> Gmail
                      </Button>
                      <Button variant={previewMode === "gmail-mobile" ? "secondary" : "ghost"} size="sm" onClick={() => setPreviewMode("gmail-mobile")} className="text-[11px]">
                        <Smartphone className="mr-1 h-3.5 w-3.5" /> Mobile
                      </Button>
                    </div>
                  </div>

                  <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    <div className="font-medium text-slate-900">{campaignIntent.senderName} &lt;{campaignIntent.fromEmail}&gt;</div>
                    <div className="mt-1">Subject: {subject || "(No subject)"}</div>
                    {preheader && <div className="mt-1">Preview: {preheader}</div>}
                  </div>

                  <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 p-3">
                    <div className={cn("mx-auto h-full overflow-hidden rounded-2xl bg-white shadow-lg", previewMode === "gmail-mobile" ? "max-w-[375px]" : "max-w-full")}>
                      <iframe
                        title="Live Email Preview"
                        srcDoc={sanitizeHtmlForIframePreview(fullHtml)}
                        className="h-full min-h-[420px] w-full border-0"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-slate-200 shadow-sm">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Send Test and Quality Gate</p>
                      <p className="text-xs text-slate-500">Validate rendering and keep an eye on spam, CTA, and length guidance.</p>
                    </div>
                    <Badge className={cn("border text-[11px]", hasErrors ? "border-red-200 bg-red-50 text-red-700" : hasWarnings ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
                      {hasErrors ? "Needs fixes" : hasWarnings ? "Review warnings" : "Ready"}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="email@example.com" className="text-sm" />
                    <Button type="button" onClick={handleSendTest} disabled={sendingTest}>
                      {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(nudges.length ? nudges : [{ id: "empty", type: "info", message: "Start writing to see insights." }]).slice(0, 4).map((nudge) => (
                      <div key={nudge.id} className={cn(
                        "rounded-2xl border p-3 text-xs",
                        nudge.type === "error" ? "border-red-200 bg-red-50 text-red-700" :
                        nudge.type === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" :
                        nudge.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                        "border-blue-200 bg-blue-50 text-blue-700"
                      )}>
                        {nudge.message}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          </div>
        </div>

        {/* Preview Modal */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Email Preview</DialogTitle>
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                  <Button variant={previewMode === "gmail-desktop" ? "secondary" : "ghost"} size="sm" onClick={() => setPreviewMode("gmail-desktop")} className="text-xs">
                    <Monitor className="w-3.5 h-3.5 mr-1" /> Gmail
                  </Button>
                  <Button variant={previewMode === "gmail-mobile" ? "secondary" : "ghost"} size="sm" onClick={() => setPreviewMode("gmail-mobile")} className="text-xs">
                    <Smartphone className="w-3.5 h-3.5 mr-1" /> Mobile
                  </Button>
                  <Button variant={previewMode === "outlook" ? "secondary" : "ghost"} size="sm" onClick={() => setPreviewMode("outlook")} className="text-xs">
                    <Mail className="w-3.5 h-3.5 mr-1" /> Outlook
                  </Button>
                </div>
              </div>
              <DialogDescription className="sr-only">
                Preview your email template across different email clients.
              </DialogDescription>
            </DialogHeader>

            {/* Active Brand Colors Strip */}
            <div className="flex items-center gap-3 px-1 py-2 border-b">
              <span className="text-xs font-medium text-slate-500">Brand Colors:</span>
              <div className="flex items-center gap-2">
                {[
                  { label: "Primary", color: brandColors.primary },
                  { label: "Secondary", color: brandColors.secondary },
                  { label: "Accent", color: brandColors.accent },
                  { label: "Button", color: brandColors.button },
                  { label: "Surface", color: brandColors.surface },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-1.5" title={`${label}: ${color}`}>
                    <span
                      className="w-5 h-5 rounded-md border border-slate-200 shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[10px] text-slate-400">{label}</span>
                  </div>
                ))}
              </div>
              {useOrgBrand && orgBrandColors && (
                <span className="ml-auto text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                  Organization Colors
                </span>
              )}
              {useCustomBrandColors && !useOrgBrand && (
                <span className="ml-auto text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">
                  Custom Colors
                </span>
              )}
              {!useCustomBrandColors && !useOrgBrand && (
                <span className="ml-auto text-[10px] bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full font-medium capitalize">
                  {brandPalette} Palette
                </span>
              )}
            </div>

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
              <div
                className={`bg-white shadow-xl overflow-hidden rounded-lg h-full ${
                  previewMode === "gmail-mobile" ? "w-[375px]" : "w-full max-w-[700px]"
                }`}
              >
                <div className={`border-b px-4 py-3 ${previewMode === "outlook" ? "bg-[#0078d4]" : "bg-white"}`}>
                  <div className={`text-xs ${previewMode === "outlook" ? "text-white" : "text-slate-500"}`}>
                    {previewMode === "outlook" ? "Microsoft Outlook" : "Gmail"}
                  </div>
                </div>
                <div className="h-[calc(100%-52px)] overflow-y-auto">
                  <iframe
                    title="Email Preview"
                    srcDoc={sanitizeHtmlForIframePreview(fullHtml)}
                    className="w-full h-full border-0"
                  />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

export default SimpleTemplateBuilder;
