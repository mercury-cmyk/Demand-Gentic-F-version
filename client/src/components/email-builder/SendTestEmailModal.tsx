import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Mail, CheckCircle2, AlertCircle } from "lucide-react";

interface SendTestEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  preheader?: string;
  htmlContent: string;
  senderProfileId: string;
  sampleContacts?: Array<{ id: string; firstName: string; lastName: string; company: string; email: string }>;
}

export function SendTestEmailModal({
  open,
  onOpenChange,
  subject,
  preheader = "",
  htmlContent,
  senderProfileId,
  sampleContacts = []
}: SendTestEmailModalProps) {
  const [testEmails, setTestEmails] = useState<string>("");
  const [selectedContactId, setSelectedContactId] = useState<string>(
    sampleContacts[0]?.id || ""
  );
  const { toast } = useToast();

  const sendTestMutation = useMutation({
    mutationFn: async (data: {
      emails: string[];
      subject: string;
      preheader?: string;
      html: string;
      senderProfileId: string;
      sampleContactId?: string;
    }) => {
      const response = await fetch("/api/campaigns/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to send test email");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Test email sent!",
        description: `Successfully sent to ${data.sentCount} recipient(s)`,
      });
      onOpenChange(false);
      setTestEmails("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send test email",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    // Validate email addresses
    const emails = testEmails
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (emails.length === 0) {
      toast({
        title: "No email addresses provided",
        description: "Please enter at least one email address",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter((e) => !emailRegex.test(e));

    if (invalidEmails.length > 0) {
      toast({
        title: "Invalid email addresses",
        description: `The following emails are invalid: ${invalidEmails.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    if (!senderProfileId) {
      toast({
        title: "No sender profile selected",
        description: "Please select a sender profile before sending test email",
        variant: "destructive",
      });
      return;
    }

    sendTestMutation.mutate({
      emails,
      subject,
      html: htmlContent,
      senderProfileId,
      preheader,
      sampleContactId: selectedContactId,
    });
  };

  const selectedContact = sampleContacts.find(c => c.id === selectedContactId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Send Test Email
          </DialogTitle>
          <DialogDescription>
            Send a test email to verify your design and content before launching the campaign.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Email Recipients */}
          <div className="space-y-2">
            <Label htmlFor="test-emails">
              Test Email Addresses
              <span className="text-xs text-muted-foreground ml-2">
                (comma-separated)
              </span>
            </Label>
            <Input
              id="test-emails"
              placeholder="email1@example.com, email2@example.com"
              value={testEmails}
              onChange={(e) => setTestEmails(e.target.value)}
              disabled={sendTestMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Enter one or more email addresses separated by commas
            </p>
          </div>

          {/* Sample Contact for Personalization */}
          {sampleContacts.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="sample-contact">
                Use Data From
                <span className="text-xs text-muted-foreground ml-2">
                  (for personalization tokens)
                </span>
              </Label>
              <Select
                value={selectedContactId}
                onValueChange={setSelectedContactId}
                disabled={sendTestMutation.isPending}
              >
                <SelectTrigger id="sample-contact">
                  <SelectValue placeholder="Select a contact..." />
                </SelectTrigger>
                <SelectContent>
                  {sampleContacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.firstName} {contact.lastName} - {contact.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedContact && (
                <div className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/20">
                  <p><strong>Preview data:</strong></p>
                  <p>First Name: {selectedContact.firstName}</p>
                  <p>Last Name: {selectedContact.lastName}</p>
                  <p>Company: {selectedContact.company}</p>
                </div>
              )}
            </div>
          )}

          {/* Subject Preview */}
          <div className="space-y-2">
            <Label>Subject Line</Label>
            <div className="text-sm border rounded-md p-2 bg-muted/20">
              {subject || "(No subject)"}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Preview Text</Label>
            <div className="text-sm border rounded-md p-2 bg-muted/20">
              {preheader || "(No preview text)"}
            </div>
          </div>

          {/* Status Messages */}
          {sendTestMutation.isSuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-50 text-green-800 rounded-md">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm">Test email sent successfully!</span>
            </div>
          )}

          {sendTestMutation.isError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-800 rounded-md">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{sendTestMutation.error.message}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sendTestMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sendTestMutation.isPending || !testEmails.trim()}
          >
            {sendTestMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Send Test Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
