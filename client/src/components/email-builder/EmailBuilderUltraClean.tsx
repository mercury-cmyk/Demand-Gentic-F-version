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
  const [builderMode, setBuilderMode] = useState<BuilderMode>("visual");
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
        return <Zap className="w-4 h-4" />;
      case "simple":
        return <FileText className="w-4 h-4" />;
      case "code":
        return <Code className="w-4 h-4" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Minimal Top Bar */}
      <div className="border-b bg-muted/50 px-4 py-2 flex items-center justify-between gap-4">
        {/* Subject (Quick Edit) */}
        <div className="flex-1 min-w-0">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject line..."
            className="text-sm font-medium h-8 border-0 bg-transparent px-0 focus-visible:ring-0 placeholder:text-muted-foreground"
          />
        </div>

        {/* Builder Mode Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="flex items-center gap-1">
              {getBuilderIcon()}
              <span className="text-xs capitalize hidden sm:inline">{builderMode}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs">Editor</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setBuilderMode("visual")}>
              <Zap className="w-3 h-3 mr-2" />
              Visual Builder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setBuilderMode("simple")}>
              <FileText className="w-3 h-3 mr-2" />
              Simple Editor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setBuilderMode("code")}>
              <Code className="w-3 h-3 mr-2" />
              HTML Code
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Quick Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowMetadata(!showMetadata)}>
              Metadata
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowPreview(true)}>
              <Eye className="w-3 h-3 mr-2" />
              Preview
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSave}>
              Save Email
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Metadata Panel (Toggle) */}
      {showMetadata && (
        <div className="border-b bg-card px-4 py-3 space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold mb-1 block">Subject Line</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="text-sm h-8"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1 block">Preview Text</Label>
              <Input
                value={preheader}
                onChange={(e) => setPreheader(e.target.value)}
                placeholder="Optional preview text..."
                className="text-sm h-8"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Canvas */}
      <div className="flex-1 min-h-0 p-4 overflow-hidden">
        {builderMode === "visual" && (
          <EmailCanvas
            initialHtml={htmlContent}
            initialDesign={design}
            onChange={handleEmailCanvasChange}
          />
        )}
        {builderMode === "simple" && (
          <SimpleEmailCanvas
            initialHtml={htmlContent}
            onChange={handleHtmlCodeChange}
          />
        )}
        {builderMode === "code" && (
          <HtmlCodeEditor
            value={htmlContent}
            onChange={handleHtmlCodeChange}
            onPreview={() => setShowPreview(true)}
            height="100%"
          />
        )}
      </div>

      {/* Bottom Action Bar (Floating) */}
      <div className="border-t bg-card px-4 py-3 flex items-center justify-between gap-2">
        {/* Test Email */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Input
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="test@example.com"
            className="text-sm h-9 flex-1"
          />
          <Button
            onClick={handleSendTest}
            variant="outline"
            size="sm"
            disabled={!testEmail.trim() || !senderProfileId}
            className="whitespace-nowrap"
          >
            <Send className="w-3 h-3 mr-1" />
            Send Test
          </Button>
        </div>

        {/* Main Actions */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowPreview(true)}
            variant="outline"
            size="sm"
          >
            <Eye className="w-3 h-3 mr-1" />
            Preview
          </Button>
          <Button
            onClick={handleSave}
            size="sm"
          >
            Save
          </Button>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <EmailPreview
          open={showPreview}
          onOpenChange={setShowPreview}
          htmlContent={htmlContent}
          subject={subject}
          preheader={preheader}
          fromName="Sender"
          fromEmail="sender@example.com"
          sampleContacts={sampleContacts}
        />
      )}
    </div>
  );
}
