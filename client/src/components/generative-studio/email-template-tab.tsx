import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail } from "lucide-react";
import GenerationForm from "./shared/generation-form";
import ContentPreview from "./shared/content-preview";

interface EmailTemplateTabProps {
  brandKits?: any[];
}

export default function EmailTemplateTab({ brandKits }: EmailTemplateTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<any>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [subjectHint, setSubjectHint] = useState("");
  const [emailType, setEmailType] = useState("");

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/generative-studio/generate/email-template", data);
      return await res.json();
    },
    onSuccess: (data) => {
      setResult(data.content);
      setProjectId(data.projectId);
      queryClient.invalidateQueries({ queryKey: ["/api/generative-studio/projects"] });
      toast({ title: "Email template generated!" });
    },
    onError: (error: any) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const saveAsAssetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/generative-studio/save-as-asset/${projectId}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved to content library!" });
    },
  });

  const handleGenerate = (params: Record<string, any>) => {
    generateMutation.mutate({
      ...params,
      subjectHint: subjectHint || undefined,
      emailType: emailType || undefined,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] h-full">
      {/* Left panel - Form */}
      <div className="border-r p-6 overflow-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600">
            <Mail className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Email Template</h2>
            <p className="text-xs text-muted-foreground">Generate professional email templates</p>
          </div>
        </div>

        <GenerationForm
          contentType="Email Template"
          brandKits={brandKits}
          onGenerate={handleGenerate}
          isGenerating={generateMutation.isPending}
          generateLabel="Generate Email"
          extraFields={
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email Type</Label>
                <Select value={emailType} onValueChange={setEmailType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cold_outreach">Cold Outreach</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="meeting_request">Meeting Request</SelectItem>
                    <SelectItem value="nurture">Nurture</SelectItem>
                    <SelectItem value="breakup">Breakup</SelectItem>
                    <SelectItem value="newsletter">Newsletter</SelectItem>
                    <SelectItem value="product_launch">Product Launch</SelectItem>
                    <SelectItem value="event_invite">Event Invitation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subject Line Hint (optional)</Label>
                <Input
                  placeholder="e.g., focus on ROI, create urgency"
                  value={subjectHint}
                  onChange={(e) => setSubjectHint(e.target.value)}
                />
              </div>
            </div>
          }
        />
      </div>

      {/* Right panel - Preview */}
      <div className="overflow-hidden">
        <ContentPreview
          content={result?.html}
          contentHtml={result?.html}
          contentType="email_template"
          metadata={result ? { subjectLine: result.subject, preheader: result.preheader } : undefined}
          projectId={projectId || undefined}
          status={projectId ? "generated" : undefined}
          onSaveAsAsset={projectId ? () => saveAsAssetMutation.mutate() : undefined}
        />
      </div>
    </div>
  );
}
