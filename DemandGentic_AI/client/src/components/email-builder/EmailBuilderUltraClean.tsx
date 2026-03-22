import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmailCanvas } from "./EmailCanvas";
import { HtmlCodeEditor } from "./HtmlCodeEditor";
import { SimpleEmailCanvas } from "./SimpleEmailCanvas";
import { EmailPreview } from "./EmailPreview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Eye, Send, MoreVertical, Code, Zap, FileText } from "lucide-react";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
}

interface EmailBuilderUltraCleanProps {
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

type BuilderMode = "visual" | "simple" | "code";

export function EmailBuilderUltraClean({
  initialSubject = "Your Email Subject",
  initialPreheader = "",
  initialHtml = "",
  initialDesign = null,
  sampleContacts = [],
  senderProfileId = "",
  onSave,
  onSendTest
}: EmailBuilderUltraCleanProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [preheader, setPreheader] = useState(initialPreheader);
  const [htmlContent, setHtmlContent] = useState(initialHtml);
  const [design, setDesign] = useState(initialDesign);
  const [builderMode, setBuilderMode] = useState("visual");
  const [showPreview, setShowPreview] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [showMetadata, setShowMetadata] = useState(false);

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
    if (testEmail.trim()) {
      onSendTest?.([testEmail.trim()]);
      setTestEmail("");
    }
  };

  const getBuilderIcon = () => {
    switch (builderMode) {
      case "visual":
        return ;
      case "simple":
        return ;
      case "code":
        return ;
    }
  };

  return (
    
      {/* Minimal Top Bar */}
      
        {/* Subject (Quick Edit) */}
        
           setSubject(e.target.value)}
            placeholder="Subject line..."
            className="text-sm font-medium h-8 border-0 bg-transparent px-0 focus-visible:ring-0 placeholder:text-muted-foreground"
          />
        

        {/* Builder Mode Selector */}
        
          
            
              {getBuilderIcon()}
              {builderMode}
            
          
          
            Editor
            
             setBuilderMode("visual")}>
              
              Visual Builder
            
             setBuilderMode("simple")}>
              
              Simple Editor
            
             setBuilderMode("code")}>
              
              HTML Code
            
          
        

        {/* Quick Actions */}
        
          
            
              
            
          
          
            Actions
            
             setShowMetadata(!showMetadata)}>
              Metadata
            
             setShowPreview(true)}>
              
              Preview
            
            
              Save Email
            
          
        
      

      {/* Metadata Panel (Toggle) */}
      {showMetadata && (
        
          
            
              Subject Line
               setSubject(e.target.value)}
                className="text-sm h-8"
              />
            
            
              Preview Text
               setPreheader(e.target.value)}
                placeholder="Optional preview text..."
                className="text-sm h-8"
              />
            
          
        
      )}

      {/* Main Canvas */}
      
        {builderMode === "visual" && (
          
        )}
        {builderMode === "simple" && (
          
        )}
        {builderMode === "code" && (
           setShowPreview(true)}
            height="100%"
          />
        )}
      

      {/* Bottom Action Bar (Floating) */}
      
        {/* Test Email */}
        
           setTestEmail(e.target.value)}
            placeholder="test@example.com"
            className="text-sm h-9 flex-1"
          />
          
            
            Send Test
          
        

        {/* Main Actions */}
        
           setShowPreview(true)}
            variant="outline"
            size="sm"
          >
            
            Preview
          
          
            Save
          
        
      

      {/* Preview Modal */}
      {showPreview && (
        
      )}
    
  );
}