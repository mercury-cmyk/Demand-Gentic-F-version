import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmailCanvas } from "./EmailCanvas";
import { HtmlCodeEditor } from "./HtmlCodeEditor";
import { EmailPreview } from "./EmailPreview";
import { Eye, Send } from "lucide-react";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
}

interface EmailBuilderCleanProps {
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

export function EmailBuilderClean({
  initialSubject = "Your Email Subject",
  initialPreheader = "",
  initialHtml = "",
  initialDesign = null,
  sampleContacts = [],
  senderProfileId = "",
  onSave,
  onSendTest
}: EmailBuilderCleanProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [preheader, setPreheader] = useState(initialPreheader);
  const [htmlContent, setHtmlContent] = useState(initialHtml);
  const [design, setDesign] = useState(initialDesign);
  const [builderMode, setBuilderMode] = useState("visual");
  const [showPreview, setShowPreview] = useState(false);
  const [testEmails, setTestEmails] = useState("");

  const hasChanges = useMemo(() => {
    return (
      subject !== initialSubject ||
      preheader !== initialPreheader ||
      htmlContent !== initialHtml
    );
  }, [subject, preheader, htmlContent, initialSubject, initialPreheader, initialHtml]);

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

  return (
    
      {/* Header Section */}
      
        
          {/* Subject */}
          
            Subject Line
             setSubject(e.target.value)}
              placeholder="Enter email subject..."
              className="text-base"
            />
            
              Preview: {subject || "(empty)"}
            
          

          {/* Preheader */}
          
            Preview Text (Optional)
             setPreheader(e.target.value)}
              placeholder="This appears in most email clients..."
              className="text-base"
            />
          
        
      

      {/* Builder Section */}
      
         setBuilderMode(v as "visual" | "code")}
          className="flex flex-col h-full"
        >
          
            Preview
            HTML
          

          
            
                setBuilderMode(mode === "design" ? "visual" : "code")
              }
            />
          

          
             setShowPreview(true)}
              height="calc(100% - 50px)"
            />
          
        
      

      {/* Action Section */}
      
        
          {/* Test Email */}
          
            Send Test Email
            
               setTestEmails(e.target.value)}
                placeholder="email@example.com, other@example.com"
                className="flex-1"
              />
              
                
                Send Test
              
            
          

          {/* Action Buttons */}
          
             setShowPreview(true)}
              variant="outline"
              className="flex-1"
            >
              
              Preview
            
            
              Save
            
          
        
      

      {/* Preview Modal */}
      {showPreview && (
        
      )}
    
  );
}