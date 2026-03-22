/**
 * EmailBuilderPro - Production-Ready Email Builder for DemandGentic.ai By Pivotal B2B
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
import { sanitizeHtmlForIframePreview } from "@/lib/html-preview";
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
  onDraftChange?: (data: {
    subject: string;
    preheader: string;
    htmlContent: string;
  }) => void;
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
  } else if (subject.length  60) {
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
  const hasCta = /]+href[^>]*>/i.test(body) || /\[CTA\]|\[BUTTON\]/i.test(body);
  if (!hasCta && body.length > 100) {
    nudges.push({
      id: "no-cta",
      type: "info",
      message: "Consider adding a clear call-to-action (CTA)",
      field: "cta"
    });
  }

  // Link count
  const linkCount = (body.match(/]+href/gi) || []).length;
  if (linkCount > 5) {
    nudges.push({
      id: "too-many-links",
      type: "warning",
      message: "Too many links can hurt deliverability. Keep it under 5.",
      field: "links"
    });
  }

  // Body length for cold outreach
  const textContent = body.replace(/]*>/g, '').trim();
  if (textContent.length > 0 && textContent.length  1500) {
    nudges.push({
      id: "body-long",
      type: "info",
      message: "Long emails may reduce engagement. Consider being more concise.",
      field: "body"
    });
  }

  // Success checks
  if (nudges.filter(n => n.type === "error" || n.type === "warning").length === 0) {
    if (subject.length >= 20 && subject.length = 100 && textContent.length  {
  // Wrap body content in email-safe structure
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
  


  
    
      
        
          
            
              ${bodyContent}
            
          
          ${footer}
        
      
    
  

`;
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
  onDraftChange,
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
  const [editorMode, setEditorMode] = useState("visual");
  
  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState("gmail-desktop");
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [showVariablesPanel, setShowVariablesPanel] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  
  // Smart nudges
  const nudges = useMemo(() => analyzeEmail(subject, bodyContent), [subject, bodyContent]);
  const hasErrors = nudges.some(n => n.type === "error");
  const hasWarnings = nudges.some(n => n.type === "warning");
  
  // Extract body content from full HTML
  function extractBodyContent(html: string): string {
    // Try to extract content between  tags in the main content area
    const match = html.match(/]*style="[^"]*padding:\s*32px[^"]*"[^>]*>([\s\S]*?)/i);
    if (match) return match[1].trim();
    
    // Fallback: extract from body
    const bodyMatch = html.match(/]*>([\s\S]*)/i);
    if (bodyMatch) return bodyMatch[1].trim();
    
    return html;
  }
  
  // Generate full HTML
  const fullHtml = useMemo(
    () => generateCleanHtml(bodyContent, organizationName, organizationAddress),
    [bodyContent, organizationName, organizationAddress]
  );

  useEffect(() => {
    onDraftChange?.({
      subject,
      preheader,
      htmlContent: fullHtml,
    });
  }, [fullHtml, onDraftChange, preheader, subject]);
  
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
    
    text += `\n\n---\n${organizationName}\n${organizationAddress}\n\nUnsubscribe: {{unsubscribe_url}}`;
    return text;
  }, [bodyContent, organizationName, organizationAddress]);

  return (
    
      
        {/* Slim Top Bar */}
        
          
            {/* Subject Line - Primary Focus */}
            
              
                Subject
                 setSubject(e.target.value)}
                  placeholder="Write a compelling subject line..."
                  className="text-base font-medium border-0 bg-transparent px-2 h-10 focus-visible:ring-1 focus-visible:ring-blue-500"
                />
                {subject.length > 0 && (
                   60 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {subject.length}/60
                  
                )}
              
            
          
          
          
             setShowPreview(true)}>
              
              Preview
            
            
            
              
              Save
            
            {onLaunch && (
              
                
                Launch
              
            )}
          
        
        
        {/* Preheader Row */}
        
          Preview Text
           setPreheader(e.target.value)}
            placeholder="Preview text shows after subject in inbox..."
            className="text-sm border-0 bg-transparent px-2 h-8 flex-1 max-w-xl focus-visible:ring-1 focus-visible:ring-blue-500"
          />
          {preheader.length}/150
        

        {/* Main Content Area */}
        
          {/* Main Canvas (70-75% width) */}
          
            {/* Editor Mode Toggle */}
            
              
                 setEditorMode("visual")}
                  className="text-xs"
                >
                  
                  Visual
                
                 setEditorMode("code")}
                  className="text-xs"
                >
                  
                  HTML
                
              
              
              {/* Quick Actions */}
              
                
                  
                    
                      
                      Templates
                    
                  
                  
                    
                      Template Library
                    
                    
                      
                        Start from a template or keep writing text-first for better deliverability.
                      
                      {/* Template list would go here */}
                    
                  
                
              
            

            {/* Email Canvas Container - Realistic Gmail/Outlook width */}
            
              
                {/* Email Container - White card with shadow */}
                
                  {editorMode === "visual" ? (
                    
                      {/* Rich Text Editor Area */}
                       setBodyContent(e.target.value)}
                        placeholder={`Hi {{first_name}},

Write your email content here. Keep it concise and focused.

Best regards,
Your Name`}
                        className="w-full min-h-[500px] p-6 text-base leading-relaxed border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
                      />
                    
                  ) : (
                    
                       setBodyContent(e.target.value)}
                        placeholder="Enter HTML content..."
                        className="w-full min-h-[500px] p-4 font-mono text-sm border-0 resize-none focus-visible:ring-0 bg-slate-900 text-green-400"
                      />
                    
                  )}
                  
                  {/* Auto-injected Footer Preview (Non-editable) */}
                  
                    {organizationName}
                    {organizationAddress}
                    
                      Unsubscribe
                      |
                      Manage Preferences
                    
                    
                      ↑ Auto-injected at send time (not editable)
                    
                  
                
              
            
          

          {/* Right Panel - Contextual (25-30% width) */}
          
            
              
                {/* Smart Nudges */}
                
                  
                    
                    Smart Insights
                  
                  
                  {nudges.length === 0 ? (
                    
                      Start writing to see deliverability insights
                    
                  ) : (
                    
                      {nudges.map((nudge) => (
                        
                          {nudge.type === "error" && }
                          {nudge.type === "warning" && }
                          {nudge.type === "success" && }
                          {nudge.type === "info" && }
                          {nudge.message}
                        
                      ))}
                    
                  )}
                

                

                {/* Personalization Variables */}
                
                  
                    
                    
                    Variables
                  
                  
                    
                      {PERSONALIZATION_TOKENS.map((item) => (
                         insertToken(item.token)}
                          className="justify-start text-xs h-8 px-2"
                        >
                          
                          {item.label}
                        
                      ))}
                    
                  
                

                

                {/* CTA Helper */}
                
                  
                    
                    
                    Add CTA Button
                  
                  
                    
                      CTAs should be HTML buttons, not images. Use 1 primary CTA for best results.
                    
                     {
                        const ctaHtml = `

  
    
      
        Click Here
      
    
  
`;
                        setBodyContent(prev => prev + ctaHtml);
                      }}
                    >
                      
                      Insert Button
                    
                  
                

                

                {/* Compliance Check */}
                
                  
                    
                    Compliance
                  
                  
                    
                      
                      Unsubscribe link auto-included
                    
                    
                      
                      Physical address included
                    
                    
                      
                      Inline CSS only (email-safe)
                    
                    
                      
                      Max width 600px
                    
                  
                

                

                {/* Test Email */}
                
                  
                    
                    Test Email
                  
                  
                     setTestEmail(e.target.value)}
                      placeholder="test@example.com"
                      className="text-xs h-8"
                    />
                    
                      
                    
                  
                
              
            
          
        

        {/* Preview Modal */}
        
          
            
              
                Email Preview
                
                   setPreviewMode("gmail-desktop")}
                    className="text-xs"
                  >
                    
                    Gmail
                  
                   setPreviewMode("gmail-mobile")}
                    className="text-xs"
                  >
                    
                    Mobile
                  
                   setPreviewMode("outlook")}
                    className="text-xs"
                  >
                    
                    Outlook
                  
                   setPreviewMode("plaintext")}
                    className="text-xs"
                  >
                    
                    Plain Text
                  
                
              
              
                Preview the email template across different email clients.
              
            
            
            {/* Email Header Preview */}
            
              
                Subject:
                {subject || "(No subject)"}
              
              {preheader && (
                
                  Preview:
                  {preheader}
                
              )}
            
            
            {/* Preview Frame */}
            
              {previewMode === "plaintext" ? (
                
                  
                    {plainTextVersion}
                  
                
              ) : (
                
                  {/* Simulated Email Client Header */}
                  
                    
                      {previewMode === "outlook" ? "Microsoft Outlook" : "Gmail"}
                    
                  
                  
                  
                    
                  
                
              )}
            
          
        
      
    
  );
}

export default EmailBuilderPro;