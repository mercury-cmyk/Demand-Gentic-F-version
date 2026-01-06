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
  const [builderMode, setBuilderMode] = useState<"visual" | "code">("visual");
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
    <div className="h-full flex flex-col gap-4 p-4 bg-background">
      {/* Header Section */}
      <Card className="p-4 bg-card border">
        <div className="space-y-4">
          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject Line</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject..."
              className="text-base"
            />
            <p className="text-xs text-muted-foreground">
              Preview: {subject || "(empty)"}
            </p>
          </div>

          {/* Preheader */}
          <div className="space-y-2">
            <Label htmlFor="preheader">Preview Text (Optional)</Label>
            <Input
              id="preheader"
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              placeholder="This appears in most email clients..."
              className="text-base"
            />
          </div>
        </div>
      </Card>

      {/* Builder Section */}
      <div className="flex-1 flex flex-col min-h-0">
        <Tabs
          value={builderMode}
          onValueChange={(v) => setBuilderMode(v as "visual" | "code")}
          className="flex flex-col h-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="visual">Visual Builder</TabsTrigger>
            <TabsTrigger value="code">HTML Code</TabsTrigger>
          </TabsList>

          <TabsContent value="visual" className="flex-1 min-h-0 mt-4">
            <EmailCanvas
              initialHtml={htmlContent}
              initialDesign={design}
              onChange={handleEmailCanvasChange}
              onModeChange={setBuilderMode}
            />
          </TabsContent>

          <TabsContent value="code" className="flex-1 min-h-0 mt-4">
            <HtmlCodeEditor
              value={htmlContent}
              onChange={handleHtmlCodeChange}
              onPreview={() => setShowPreview(true)}
              height="calc(100% - 50px)"
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Action Section */}
      <Card className="p-4 bg-card border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Test Email */}
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="test-emails">Send Test Email</Label>
            <div className="flex gap-2">
              <Input
                id="test-emails"
                value={testEmails}
                onChange={(e) => setTestEmails(e.target.value)}
                placeholder="email@example.com, other@example.com"
                className="flex-1"
              />
              <Button
                onClick={handleSendTest}
                variant="outline"
                disabled={!testEmails.trim() || !senderProfileId}
                title={!senderProfileId ? "Select a sender profile first" : ""}
              >
                <Send className="w-4 h-4 mr-1" />
                Send Test
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-end gap-2">
            <Button
              onClick={() => setShowPreview(true)}
              variant="outline"
              className="flex-1"
            >
              <Eye className="w-4 h-4 mr-1" />
              Preview
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges}
              className="flex-1"
            >
              Save
            </Button>
          </div>
        </div>
      </Card>

      {/* Preview Modal */}
      {showPreview && (
        <EmailPreview
          open={showPreview}
          onOpenChange={setShowPreview}
          htmlContent={htmlContent}
          subject={subject}
          preheader={preheader}
          fromName="Sender Name"
          fromEmail="sender@example.com"
          sampleContacts={sampleContacts}
        />
      )}
    </div>
  );
}
