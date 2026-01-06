/**
 * EmailBuilderPro - Production-Ready Email Builder for DemandGent.ai
 * 
 * Design Philosophy:
 * - Text-first, deliverability-focused
 * - Gmail/Outlook first rendering
 * - No auto-logos, no image-heavy headers
 * - Clean, distraction-free writing experience
 * - Smart nudges instead of intrusive templates
 * - Auto-injected footer for compliance
 */

import { useState, useCallback, useMemo, useEffect } from "react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Eye,
  Send,
  Save,
  Code2,
  Type,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronRight,
  Smartphone,
  Monitor,
  Mail,
  FileText,
  Sparkles,
  Link2,
  MousePointer,
  AtSign,
  Building2,
  User,
  X,
  Lightbulb,
  LayoutTemplate,
  Zap,
  AlertCircle
} from "lucide-react";

// Types
interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
}

interface EmailBuilderProProps {
  initialSubject?: string;
  initialPreheader?: string;
  initialHtml?: string;
  organizationName?: string;
  organizationAddress?: string;
  sampleContacts?: Contact[];
  senderProfileId?: string;
  onSave?: (data: {
    subject: string;
    preheader: string;
    htmlContent: string;
  }) => void;
  onSendTest?: (emails: string[]) => void;
  onLaunch?: () => void;
}

interface SmartNudge {
  id: string;
  type: "warning" | "info" | "success" | "error";
  message: string;
  field?: "subject" | "body" | "cta" | "links";
}

// Spam trigger words to check
const SPAM_TRIGGER_WORDS = [
  "free", "act now", "limited time", "urgent", "click here", "winner",
  "congratulations", "guarantee", "no obligation", "risk free", "100%",
  "amazing", "incredible", "unbelievable", "miracle", "$$$", "!!!",
  "make money", "earn cash", "buy now", "order now"
];

// Email validation utilities
const analyzeEmail = (subject: string, body: string): SmartNudge[] => {
  const nudges: SmartNudge[] = [];

  // Subject line checks
  if (subject.length === 0) {
    nudges.push({
      id: "subject-empty",
      type: "error",
      message: "Subject line is required",
      field: "subject"
    });
  } else if (subject.length < 20) {
    nudges.push({
      id: "subject-short",
      type: "info",
      message: "Subject line might be too short. Aim for 30-60 characters.",
      field: "subject"
    });
  } else if (subject.length > 60) {
    nudges.push({
      id: "subject-long",
      type: "warning",
      message: "Subject line may be truncated in mobile inboxes",
      field: "subject"
    });
  }

  // Spam word detection
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const foundSpamWords = SPAM_TRIGGER_WORDS.filter(
    word => subjectLower.includes(word) || bodyLower.includes(word)
  );
  if (foundSpamWords.length > 0) {
    nudges.push({
      id: "spam-words",
      type: "warning",
      message: `Spam-risk phrases detected: ${foundSpamWords.slice(0, 3).join(", ")}`,
      field: "body"
    });
  }

  // Check for excessive exclamation marks
  const exclamationCount = (subject + body).match(/!/g)?.length || 0;
  if (exclamationCount > 3) {
    nudges.push({
      id: "exclamation",
      type: "warning",
      message: "Too many exclamation marks can trigger spam filters",
      field: "body"
    });
  }

  // Check for ALL CAPS
  const capsWords = subject.match(/\b[A-Z]{4,}\b/g);
  if (capsWords && capsWords.length > 1) {
    nudges.push({
      id: "caps",
      type: "warning",
      message: "Avoid using ALL CAPS - it triggers spam filters",
      field: "subject"
    });
  }

  // CTA detection
  const hasCta = /<a[^>]+href[^>]*>/i.test(body) || /\[CTA\]|\[BUTTON\]/i.test(body);
  if (!hasCta && body.length > 100) {
    nudges.push({
      id: "no-cta",
      type: "info",
      message: "Consider adding a clear call-to-action (CTA)",
      field: "cta"
    });
  }

  // Link count
  const linkCount = (body.match(/<a[^>]+href/gi) || []).length;
  if (linkCount > 5) {
    nudges.push({
      id: "too-many-links",
      type: "warning",
      message: "Too many links can hurt deliverability. Keep it under 5.",
      field: "links"
    });
  }

  // Body length for cold outreach
  const textContent = body.replace(/<[^>]*>/g, '').trim();
  if (textContent.length > 0 && textContent.length < 50) {
    nudges.push({
      id: "body-short",
      type: "info",
      message: "Email body seems too short for engagement",
      field: "body"
    });
  } else if (textContent.length > 1500) {
    nudges.push({
      id: "body-long",
      type: "info",
      message: "Long emails may reduce engagement. Consider being more concise.",
      field: "body"
    });
  }

  // Success checks
  if (nudges.filter(n => n.type === "error" || n.type === "warning").length === 0) {
    if (subject.length >= 20 && subject.length <= 60) {
      nudges.push({
        id: "subject-optimal",
        type: "success",
        message: "Subject line length is optimal",
        field: "subject"
      });
    }
    if (textContent.length >= 100 && textContent.length <= 500) {
      nudges.push({
        id: "body-optimal",
        type: "success",
        message: "Email length is optimal for cold outreach",
        field: "body"
      });
    }
  }

  return nudges;
};

// Generate email-safe HTML with inline CSS (Gmail/Outlook compatible)
const generateCleanHtml = (bodyContent: string, organizationName: string, organizationAddress: string): string => {
  // Wrap body content in email-safe structure
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

// Personalization tokens
const PERSONALIZATION_TOKENS = [
  { token: "{{first_name}}", label: "First Name", icon: User },
  { token: "{{last_name}}", label: "Last Name", icon: User },
  { token: "{{company}}", label: "Company", icon: Building2 },
  { token: "{{email}}", label: "Email", icon: AtSign },
  { token: "{{job_title}}", label: "Job Title", icon: User },
];

export function EmailBuilderPro({
  initialSubject = "",
  initialPreheader = "",
  initialHtml = "",
  organizationName = "Your Company",
  organizationAddress = "123 Business St, City, State 12345",
  sampleContacts = [],
  senderProfileId = "",
  onSave,
  onSendTest,
  onLaunch
}: EmailBuilderProProps) {
  // Core state
  const [subject, setSubject] = useState(initialSubject);
  const [preheader, setPreheader] = useState(initialPreheader);
  const [bodyContent, setBodyContent] = useState(
    initialHtml ? extractBodyContent(initialHtml) : ""
  );
  const [editorMode, setEditorMode] = useState<"visual" | "code">("visual");
  
  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<"gmail-desktop" | "gmail-mobile" | "outlook" | "plaintext">("gmail-desktop");
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [showVariablesPanel, setShowVariablesPanel] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  
  // Smart nudges
  const nudges = useMemo(() => analyzeEmail(subject, bodyContent), [subject, bodyContent]);
  const hasErrors = nudges.some(n => n.type === "error");
  const hasWarnings = nudges.some(n => n.type === "warning");
  
  // Extract body content from full HTML
  function extractBodyContent(html: string): string {
    // Try to extract content between <td> tags in the main content area
    const match = html.match(/<td[^>]*style="[^"]*padding:\s*32px[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    if (match) return match[1].trim();
    
    // Fallback: extract from body
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) return bodyMatch[1].trim();
    
    return html;
  }
  
  // Generate full HTML
  const fullHtml = useMemo(
    () => generateCleanHtml(bodyContent, organizationName, organizationAddress),
    [bodyContent, organizationName, organizationAddress]
  );
  
  // Insert token at cursor
  const insertToken = useCallback((token: string) => {
    setBodyContent(prev => prev + token);
  }, []);
  
  // Handle save
  const handleSave = () => {
    onSave?.({
      subject,
      preheader,
      htmlContent: fullHtml
    });
  };
  
  // Handle test send
  const handleSendTest = () => {
    if (testEmail.trim()) {
      const emails = testEmail.split(",").map(e => e.trim()).filter(Boolean);
      onSendTest?.(emails);
    }
  };
  
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
    
    text += `\n\n---\n${organizationName}\n${organizationAddress}\n\nUnsubscribe: {{unsubscribe_url}}`;
    return text;
  }, [bodyContent, organizationName, organizationAddress]);

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col bg-slate-50">
        {/* Slim Top Bar */}
        <div className="border-b bg-white px-6 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4 flex-1">
            {/* Subject Line - Primary Focus */}
            <div className="flex-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Write a compelling subject line..."
                  className="text-base font-medium border-0 bg-transparent px-2 h-10 focus-visible:ring-1 focus-visible:ring-blue-500"
                />
                {subject.length > 0 && (
                  <span className={`text-xs whitespace-nowrap ${subject.length > 60 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {subject.length}/60
                  </span>
                )}
              </div>
            </div>
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
            {onLaunch && (
              <Button 
                size="sm" 
                onClick={onLaunch}
                disabled={hasErrors}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="w-4 h-4 mr-1" />
                Launch
              </Button>
            )}
          </div>
        </div>
        
        {/* Preheader Row */}
        <div className="border-b bg-white/50 px-6 py-2 flex items-center gap-4">
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Preview Text</Label>
          <Input
            value={preheader}
            onChange={(e) => setPreheader(e.target.value)}
            placeholder="Preview text shows after subject in inbox..."
            className="text-sm border-0 bg-transparent px-2 h-8 flex-1 max-w-xl focus-visible:ring-1 focus-visible:ring-blue-500"
          />
          <span className="text-xs text-slate-400">{preheader.length}/150</span>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex min-h-0">
          {/* Main Canvas (70-75% width) */}
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
              </div>
              
              {/* Quick Actions */}
              <div className="flex items-center gap-2">
                <Sheet open={showTemplateLibrary} onOpenChange={setShowTemplateLibrary}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-xs">
                      <LayoutTemplate className="w-3.5 h-3.5 mr-1" />
                      Templates
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[400px]">
                    <SheetHeader>
                      <SheetTitle>Template Library</SheetTitle>
                    </SheetHeader>
                    <div className="py-4">
                      <p className="text-sm text-slate-500">
                        Start from a template or keep writing text-first for better deliverability.
                      </p>
                      {/* Template list would go here */}
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            {/* Email Canvas Container - Realistic Gmail/Outlook width */}
            <div className="flex-1 flex justify-center overflow-auto pb-4">
              <div className="w-full max-w-[600px]">
                {/* Email Container - White card with shadow */}
                <div className="bg-white rounded-lg shadow-lg border overflow-hidden">
                  {editorMode === "visual" ? (
                    <div className="min-h-[500px]">
                      {/* Rich Text Editor Area */}
                      <Textarea
                        value={bodyContent}
                        onChange={(e) => setBodyContent(e.target.value)}
                        placeholder={`Hi {{first_name}},

Write your email content here. Keep it concise and focused.

Best regards,
Your Name`}
                        className="w-full min-h-[500px] p-6 text-base leading-relaxed border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
                      />
                    </div>
                  ) : (
                    <div className="min-h-[500px]">
                      <Textarea
                        value={bodyContent}
                        onChange={(e) => setBodyContent(e.target.value)}
                        placeholder="Enter HTML content..."
                        className="w-full min-h-[500px] p-4 font-mono text-sm border-0 resize-none focus-visible:ring-0 bg-slate-900 text-green-400"
                      />
                    </div>
                  )}
                  
                  {/* Auto-injected Footer Preview (Non-editable) */}
                  <div className="border-t bg-slate-50 p-4 text-center text-xs text-slate-500">
                    <div className="font-semibold text-slate-600 mb-1">{organizationName}</div>
                    <div className="mb-2">{organizationAddress}</div>
                    <div className="text-slate-400">
                      <span className="underline cursor-pointer">Unsubscribe</span>
                      <span className="mx-2">|</span>
                      <span className="underline cursor-pointer">Manage Preferences</span>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 italic">
                      ↑ Auto-injected at send time (not editable)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Contextual (25-30% width) */}
          <div className="w-72 border-l bg-white flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                {/* Smart Nudges */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-semibold text-slate-700">Smart Insights</h3>
                  </div>
                  
                  {nudges.length === 0 ? (
                    <div className="text-sm text-slate-500 p-3 bg-slate-50 rounded-lg">
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

                {/* Personalization Variables */}
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full">
                    <ChevronDown className="w-4 h-4 text-slate-400 transition-transform [[data-state=closed]_&]:-rotate-90" />
                    <AtSign className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold text-slate-700">Variables</h3>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <div className="grid grid-cols-2 gap-1.5">
                      {PERSONALIZATION_TOKENS.map((item) => (
                        <Button
                          key={item.token}
                          variant="outline"
                          size="sm"
                          onClick={() => insertToken(item.token)}
                          className="justify-start text-xs h-8 px-2"
                        >
                          <item.icon className="w-3 h-3 mr-1.5" />
                          {item.label}
                        </Button>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                {/* CTA Helper */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full">
                    <ChevronDown className="w-4 h-4 text-slate-400 transition-transform [[data-state=closed]_&]:-rotate-90" />
                    <MousePointer className="w-4 h-4 text-green-500" />
                    <h3 className="text-sm font-semibold text-slate-700">Add CTA Button</h3>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3 space-y-3">
                    <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded">
                      CTAs should be HTML buttons, not images. Use 1 primary CTA for best results.
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => {
                        const ctaHtml = `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
  <tr>
    <td style="background-color: #2563eb; border-radius: 6px;">
      <a href="https://example.com" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px;">
        Click Here
      </a>
    </td>
  </tr>
</table>`;
                        setBodyContent(prev => prev + ctaHtml);
                      }}
                    >
                      <Zap className="w-3 h-3 mr-1" />
                      Insert Button
                    </Button>
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                {/* Compliance Check */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <h3 className="text-sm font-semibold text-slate-700">Compliance</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Unsubscribe link auto-included</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Physical address included</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Inline CSS only (email-safe)</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Max width 600px</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Test Email */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Send className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold text-slate-700">Test Email</h3>
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
                      disabled={!testEmail.trim()}
                      className="h-8 px-3"
                    >
                      <Send className="w-3 h-3" />
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
                Preview the email template across different email clients.
              </DialogDescription>
            </DialogHeader>
            
            {/* Email Header Preview */}
            <div className="border-b pb-4 space-y-2">
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

export default EmailBuilderPro;
