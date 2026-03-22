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
  sampleContacts?: Array;
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
  const [viewMode, setViewMode] = useState("desktop");
  const [darkMode, setDarkMode] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState(
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
      .replace(//g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    const block = `
      
        ${safeText}
      
    `;
    if (/]*>/i.test(html)) {
      return html.replace(/]*>/i, (match) => `${match}${block}`);
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
    
      
        
          
            Email Preview
            
              {/* Contact Selector */}
              {sampleContacts.length > 0 && (
                
                  
                    
                  
                  
                    {sampleContacts.map((contact) => (
                      
                        {contact.firstName} {contact.lastName} - {contact.company}
                      
                    ))}
                  
                
              )}

              {/* View Mode Toggle */}
              
                 setViewMode("desktop")}
                  title="Desktop View"
                >
                  
                
                 setViewMode("tablet")}
                  title="Tablet View"
                >
                  
                
                 setViewMode("mobile")}
                  title="Mobile View"
                >
                  
                
              

              {/* Dark Mode Toggle */}
               setDarkMode(!darkMode)}
                title={darkMode ? "Light Mode" : "Dark Mode"}
              >
                {darkMode ?  : }
              
            
          
          
            Preview the generated email content with sample personalization across desktop, tablet, and mobile views.
          
        

        {/* Email Header Info */}
        
          
            
              From
              
                {fromName} &lt;{fromEmail}&gt;
              
            
            {selectedContact && (
              
                To
                
                  {selectedContact.firstName} {selectedContact.lastName} &lt;{selectedContact.email}&gt;
                
              
            )}
          
          
            Subject
            {subject}
          
          
            Preview text
            
              {personalizedPreheader || "Not set"}
            
          
          
            {viewMode}
            {darkMode && Dark Mode}
          
        

        {/* Preview Frame */}
        
          
            
              
                  
                    
                      
                      
                      
                      
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
                      
                    
                    
                      ${sanitizedPreviewHtml}
                    
                  
                `}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none"
                }}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
              />
            
          
        
      
    
  );
}