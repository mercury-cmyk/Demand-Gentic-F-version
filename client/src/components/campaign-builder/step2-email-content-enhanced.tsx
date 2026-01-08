import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Mail,
  Eye,
  Send,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  EmailBuilderPro,
  TemplateSelectorModal,
  SendTestEmailModal,
  EmailPreview
} from "@/components/email-builder";

interface Step2EmailContentEnhancedProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

interface SenderProfile {
  id: string;
  name: string;
  email: string;
  isVerified: boolean;
}

interface Campaign {
  id: string;
  name: string;
  audienceSize?: number;
  sampleContacts?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    company: string;
    email: string;
  }>;
}

export function Step2EmailContentEnhanced({
  data,
  onNext,
  onBack
}: Step2EmailContentEnhancedProps) {
  const { toast } = useToast();

  // Email Content State
  const [subject, setSubject] = useState(data.content?.subject || "");
  const [preheader, setPreheader] = useState(data.content?.preheader || "");
  const [htmlContent, setHtmlContent] = useState(data.content?.html || "");
  const [design, setDesign] = useState(data.content?.design || null);

  // UI State
  const [activeTab, setActiveTab] = useState<"builder" | "template" | "preview">("builder");
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showTestEmail, setShowTestEmail] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Sender Profile
  const [senderProfileId, setSenderProfileId] = useState(data.content?.senderProfileId || "");
  const [senderProfiles, setSenderProfiles] = useState<SenderProfile[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(true);

  // Validation
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Sample data for preview
  const sampleContacts = data.audience?.sampleContacts || [
    {
      id: "1",
      firstName: "John",
      lastName: "Doe",
      company: "Acme Corp",
      email: "john@acme.com"
    },
    {
      id: "2",
      firstName: "Jane",
      lastName: "Smith",
      company: "Tech Inc",
      email: "jane@tech.com"
    }
  ];

  // Fetch sender profiles
  useEffect(() => {
    const fetchSenderProfiles = async () => {
      try {
        setLoadingSenders(true);
        const res = await apiRequest("GET", "/api/sender-profiles");
        const response = await res.json();
        setSenderProfiles(response || []);

        // Auto-select first verified profile if none selected
        if (!senderProfileId && response?.length > 0) {
          const verifiedProfile = response.find((p: any) => p.isVerified);
          if (verifiedProfile) {
            setSenderProfileId(verifiedProfile.id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch sender profiles:", error);
        toast({
          title: "Error",
          description: "Failed to load sender profiles",
          variant: "destructive"
        });
      } finally {
        setLoadingSenders(false);
      }
    };

    fetchSenderProfiles();
  }, []);

  // Validate content
  const validateContent = () => {
    const errors: string[] = [];

    if (!subject.trim()) {
      errors.push("Subject line is required");
    }
    if (!htmlContent.trim()) {
      errors.push("Email content is required");
    }
    if (!senderProfileId) {
      errors.push("Sender profile must be selected");
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Handle save
  const handleSave = () => {
    if (validateContent()) {
      onNext({
        content: {
          subject,
          preheader,
          html: htmlContent,
          design,
          senderProfileId
        }
      });
    } else {
      toast({
        title: "Validation Error",
        description: "Please fix the errors below",
        variant: "destructive"
      });
    }
  };

  // Handle template selection
  const handleSelectTemplate = (template: any) => {
    setSubject(template.subject || subject);
    setPreheader(template.preheader || preheader);
    setHtmlContent(template.htmlContent || htmlContent);
    setShowTemplateSelector(false);
    toast({
      title: "Template loaded",
      description: "Template content has been loaded into your email"
    });
  };

  // Handle builder save
  const handleBuilderSave = (emailData: any) => {
    setSubject(emailData.subject);
    setPreheader(emailData.preheader);
    setHtmlContent(emailData.htmlContent);
    setDesign(emailData.design);
    toast({
      title: "Email saved",
      description: "Your email content has been updated"
    });
  };

  // Get selected sender profile
  const selectedSender = senderProfiles.find((p) => p.id === senderProfileId);
  const isVerified = selectedSender?.isVerified;

  return (
    <div className="space-y-6">
      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <div className="space-y-2">
              {validationErrors.map((error, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sender Profile Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Sender Profile</CardTitle>
          <CardDescription>Choose verified sender for this campaign</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From Email</Label>
              <Select value={senderProfileId} onValueChange={setSenderProfileId}>
                <SelectTrigger disabled={loadingSenders}>
                  <SelectValue placeholder="Select sender profile..." />
                </SelectTrigger>
                <SelectContent>
                  {senderProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      <div className="flex items-center gap-2">
                        {profile.name || profile.email}
                        {profile.isVerified ? (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            Not Verified
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSender && (
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input
                  value={selectedSender.email}
                  disabled
                  className="bg-muted"
                />
              </div>
            )}
          </div>

          {!isVerified && senderProfileId && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-700">
                <p className="font-medium mb-1">Sender Not Verified</p>
                <p>This sender profile has not been verified. Emails may have lower deliverability.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Editor Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="builder">Email Builder</TabsTrigger>
          <TabsTrigger value="template">Templates</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        {/* Builder Tab */}
        <TabsContent value="builder" className="space-y-4">
          <div className="h-[700px] border rounded-lg overflow-hidden">
            <EmailBuilderPro
              initialSubject={subject}
              initialPreheader={preheader}
              initialHtml={htmlContent}
              organizationName="DemandGent"
              organizationAddress="123 Business Street, Suite 500, San Francisco, CA 94105"
              sampleContacts={sampleContacts}
              senderProfileId={senderProfileId}
              onSave={(emailData) => {
                setSubject(emailData.subject);
                setPreheader(emailData.preheader);
                setHtmlContent(emailData.htmlContent);
                toast({
                  title: "Email saved",
                  description: "Your email content has been updated"
                });
              }}
              onSendTest={async (emails) => {
                try {
                  const response = await apiRequest("POST", "/api/campaigns/send-test", {
                    emails,
                    subject,
                    preheader,
                    html: htmlContent,
                    senderProfileId
                  });

                  toast({
                    title: "Test email sent",
                    description: `Email sent to ${emails.join(", ")}`
                  });
                } catch (error) {
                  toast({
                    title: "Error sending test email",
                    description: error instanceof Error ? error.message : "Failed to send test email",
                    variant: "destructive"
                  });
                }
              }}
            />
          </div>
        </TabsContent>

        {/* Template Tab */}
        <TabsContent value="template" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email Templates</CardTitle>
              <CardDescription>Choose from pre-built templates or your saved templates</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setShowTemplateSelector(true)}
                className="w-full"
              >
                <Mail className="w-4 h-4 mr-2" />
                Browse Templates
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preview Tab */}
        <TabsContent value="preview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email Preview</CardTitle>
              <CardDescription>Preview how your email looks on different devices</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setShowPreview(true)}
                className="w-full"
              >
                <Eye className="w-4 h-4 mr-2" />
                Open Preview
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Email Summary Card */}
      <Card className="bg-muted/50 border-0">
        <CardHeader>
          <CardTitle className="text-base">Email Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Subject Line</Label>
              <p className="font-medium text-sm mt-1 truncate">
                {subject || "(No subject)"}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <p className="font-medium text-sm mt-1 truncate">
                {selectedSender?.name || selectedSender?.email || "(Not selected)"}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Preview Text</Label>
              <p className="font-medium text-sm mt-1 truncate">
                {preheader || "(Not set)"}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Content Status</Label>
              <div className="flex items-center gap-2 mt-1">
                {htmlContent ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Ready</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm">Empty</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={onBack}
        >
          Back to Audience
        </Button>
        <Button
          onClick={handleSave}
          size="lg"
        >
          Continue to Scheduling
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Modals */}
      <TemplateSelectorModal
        open={showTemplateSelector}
        onOpenChange={setShowTemplateSelector}
        onSelectTemplate={handleSelectTemplate}
      />

      {showPreview && (
        <EmailPreview
          open={showPreview}
          onOpenChange={setShowPreview}
          htmlContent={htmlContent}
          subject={subject}
          preheader={preheader}
          fromName={selectedSender?.name || "Sender"}
          fromEmail={selectedSender?.email || "sender@example.com"}
          sampleContacts={sampleContacts}
        />
      )}
    </div>
  );
}
