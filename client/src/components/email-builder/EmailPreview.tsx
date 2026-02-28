import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Monitor, Smartphone, Tablet, Moon, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { sanitizeHtmlForIframePreview } from "@/lib/html-preview";

interface EmailPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  htmlContent: string;
  subject?: string;
  preheader?: string;
  fromName?: string;
  fromEmail?: string;
  sampleContacts?: Array<{ id: string; firstName: string; lastName: string; company: string; email: string }>;
  onSelectContact?: (contactId: string) => void;
}

export function EmailPreview({
  open,
  onOpenChange,
  htmlContent,
  subject = "Your Email Subject",
  preheader = "",
  fromName = "Your Name",
  fromEmail = "you@example.com",
  sampleContacts = [],
  onSelectContact
}: EmailPreviewProps) {
  const [viewMode, setViewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [darkMode, setDarkMode] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>(
    sampleContacts[0]?.id || ""
  );

  const getViewportWidth = () => {
    switch (viewMode) {
      case "mobile":
        return "375px";
      case "tablet":
        return "768px";
      default:
        return "100%";
    }
  };

  const personalizeTokens = (input: string) => {
    if (!selectedContactId || sampleContacts.length === 0) return input;
    const contact = sampleContacts.find(c => c.id === selectedContactId);
    if (!contact) return input;
    let result = input;
    result = result.replace(/\{\{contact\.first_name\}\}/gi, contact.firstName || "");
    result = result.replace(/\{\{contact\.last_name\}\}/gi, contact.lastName || "");
    result = result.replace(/\{\{contact\.company\}\}/gi, contact.company || "");
    result = result.replace(/\{\{contact\.email\}\}/gi, contact.email || "");
    result = result.replace(/\{\{account\.name\}\}/gi, contact.company || "");
    return result;
  };

  const renderPreviewWithPersonalization = (html: string) => personalizeTokens(html);

  const injectPreheader = (html: string, preview?: string) => {
    const text = preview?.trim();
    if (!text) return html;
    const safeText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    const block = `
      <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        ${safeText}
      </div>
    `;
    if (/<body[^>]*>/i.test(html)) {
      return html.replace(/<body[^>]*>/i, (match) => `${match}${block}`);
    }
    return `${block}${html}`;
  };

  const handleContactChange = (contactId: string) => {
    setSelectedContactId(contactId);
    onSelectContact?.(contactId);
  };

  const selectedContact = sampleContacts.find(c => c.id === selectedContactId);
  const personalizedPreheader = personalizeTokens(preheader);
  const htmlWithPersonalization = renderPreviewWithPersonalization(htmlContent);
  const previewHtml = injectPreheader(htmlWithPersonalization, personalizedPreheader);
  const sanitizedPreviewHtml = sanitizeHtmlForIframePreview(previewHtml);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Email Preview</span>
            <div className="flex items-center gap-2">
              {/* Contact Selector */}
              {sampleContacts.length > 0 && (
                <Select value={selectedContactId} onValueChange={handleContactChange}>
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="Select preview contact..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sampleContacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.firstName} {contact.lastName} - {contact.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 border rounded-md p-1">
                <Button
                  variant={viewMode === "desktop" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("desktop")}
                  title="Desktop View"
                >
                  <Monitor className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === "tablet" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("tablet")}
                  title="Tablet View"
                >
                  <Tablet className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === "mobile" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("mobile")}
                  title="Mobile View"
                >
                  <Smartphone className="w-4 h-4" />
                </Button>
              </div>

              {/* Dark Mode Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? "Light Mode" : "Dark Mode"}
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription>
            Preview the generated email content with sample personalization across desktop, tablet, and mobile views.
          </DialogDescription>
        </DialogHeader>

        {/* Email Header Info */}
        <div className="border-b pb-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">From</p>
              <p className="font-medium">
                {fromName} &lt;{fromEmail}&gt;
              </p>
            </div>
            {selectedContact && (
              <div className="text-right">
                <p className="text-sm text-muted-foreground">To</p>
                <p className="font-medium">
                  {selectedContact.firstName} {selectedContact.lastName} &lt;{selectedContact.email}&gt;
                </p>
              </div>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Subject</p>
            <p className="font-medium">{subject}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Preview text</p>
            <p className="font-medium text-slate-600">
              {personalizedPreheader || "Not set"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{viewMode}</Badge>
            {darkMode && <Badge variant="outline">Dark Mode</Badge>}
          </div>
        </div>

        {/* Preview Frame */}
        <div className="flex-1 overflow-hidden bg-muted/20 rounded-md flex items-center justify-center">
          <div
            className={`transition-all duration-300 overflow-hidden shadow-xl ${
              darkMode ? "bg-gray-900" : "bg-white"
            }`}
            style={{
              width: getViewportWidth(),
              maxWidth: "100%",
              height: "100%",
              margin: "0 auto"
            }}
          >
            <div className="h-full overflow-y-auto">
              <iframe
                title="Email Preview"
                srcDoc={`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <meta charset="UTF-8">
                      <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      <meta name="color-scheme" content="${darkMode ? "dark" : "light"}">
                      <style>
                        body {
                          margin: 0;
                          padding: 20px;
                          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                          background-color: ${darkMode ? "#1f2937" : "#ffffff"};
                          color: ${darkMode ? "#f3f4f6" : "#111827"};
                        }
                        a {
                          color: ${darkMode ? "#60a5fa" : "#3b82f6"};
                        }
                        img {
                          max-width: 100%;
                          height: auto;
                        }
                      </style>
                    </head>
                    <body>
                      ${sanitizedPreviewHtml}
                    </body>
                  </html>
                `}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none"
                }}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
