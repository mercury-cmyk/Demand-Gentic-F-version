import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileText,
  FolderKanban,
  LayoutTemplate,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { EmailBuilderPro, TemplateSelectorModal } from "@/components/email-builder";

interface Step2EmailContentEnhancedProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

interface SenderProfile {
  id: string;
  name: string;
  email: string;
  replyToEmail: string;
  isVerified: boolean | null;
}

interface ClientAccount {
  id: string;
  name: string;
}

interface ClientProject {
  id: string;
  name: string;
  description?: string | null;
  summary?: string | null;
  brief?: string | null;
}

interface DraftPayload {
  subject: string;
  preheader: string;
  htmlContent: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
}

const DEFAULT_ORGANIZATION_NAME = "Pivotal B2B";
const DEFAULT_ORGANIZATION_ADDRESS = "16192 Coastal Highway, Lewes, DE 19958, USA";

function normalizeSenderProfiles(payload: unknown): SenderProfile[] {
  const rawProfiles = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { senderProfiles?: unknown[] } | null)?.senderProfiles)
      ? ((payload as { senderProfiles?: unknown[] }).senderProfiles || [])
      : [];

  return rawProfiles
    .map((profile: any) => ({
      id: String(profile?.id || ""),
      name: profile?.fromName || profile?.name || profile?.fromEmail || profile?.email || "Unnamed sender",
      email: profile?.fromEmail || profile?.email || "",
      replyToEmail: profile?.replyToEmail || profile?.replyTo || profile?.fromEmail || profile?.email || "",
      isVerified: profile?.isVerified ?? profile?.verified ?? null,
    }))
    .filter((profile) => profile.id && profile.email);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildDefaultAiBrief(params: {
  campaignName: string;
  clientName: string;
  projectName: string;
  projectDescription: string;
  audienceCount: number;
}): string {
  const lines = [
    params.campaignName ? `Campaign: ${params.campaignName}` : "",
    params.clientName ? `Client: ${params.clientName}` : "",
    params.projectName ? `Project: ${params.projectName}` : "",
    params.audienceCount > 0 ? `Audience size: ${params.audienceCount.toLocaleString()} contacts` : "",
    params.projectDescription ? `Project context: ${params.projectDescription}` : "",
    "Write a concise B2B email with one clear CTA, concrete value, and natural personalization.",
  ].filter(Boolean);

  return lines.join("\n");
}

export function Step2EmailContentEnhanced({
  data,
  onNext,
  onBack,
}: Step2EmailContentEnhancedProps) {
  const { toast } = useToast();

  const [subject, setSubject] = useState(data.content?.subject || "");
  const [preheader, setPreheader] = useState(data.content?.preheader || "");
  const [htmlContent, setHtmlContent] = useState(data.content?.html || "");
  const [draftOrigin, setDraftOrigin] = useState<"existing" | "manual" | "ai" | "template">(
    data.content?.html ? "existing" : "manual",
  );
  const [builderVersion, setBuilderVersion] = useState(0);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  const [senderProfileId, setSenderProfileId] = useState(data.content?.senderProfileId || "");
  const [senderProfiles, setSenderProfiles] = useState<SenderProfile[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(true);

  const [clientName, setClientName] = useState(data.clientName || "");
  const [projectName, setProjectName] = useState(data.projectName || "");
  const [projectDescription, setProjectDescription] = useState(data.projectDescription || "");

  const [aiBrief, setAiBrief] = useState(data.content?.aiBrief || "");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [subjectSuggesting, setSubjectSuggesting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const sampleContacts = data.audience?.sampleContacts || [
    {
      id: "1",
      firstName: "John",
      lastName: "Doe",
      company: "Acme Corp",
      email: "john@acme.com",
    },
    {
      id: "2",
      firstName: "Jane",
      lastName: "Smith",
      company: "Tech Inc",
      email: "jane@tech.com",
    },
  ];

  useEffect(() => {
    let active = true;

    const fetchSenderProfiles = async () => {
      try {
        setLoadingSenders(true);
        const response = await apiRequest("GET", "/api/sender-profiles");
        const payload = await response.json();
        if (!active) return;

        const profiles = normalizeSenderProfiles(payload);
        setSenderProfiles(profiles);

        if (profiles.length > 0) {
          const defaultSender = profiles.find((profile) => profile.isVerified) || profiles[0];
          setSenderProfileId((current) =>
            current && profiles.some((profile) => profile.id === current) ? current : defaultSender.id,
          );
        }
      } catch (error) {
        console.error("Failed to fetch sender profiles:", error);
        if (!active) return;
        toast({
          title: "Sender route unavailable",
          description: "We could not load sender profiles for this campaign.",
          variant: "destructive",
        });
      } finally {
        if (active) setLoadingSenders(false);
      }
    };

    fetchSenderProfiles();
    return () => {
      active = false;
    };
  }, [toast]);

  useEffect(() => {
    if (!data.clientAccountId) return undefined;

    let active = true;
    const loadCampaignContext = async () => {
      try {
        const [clientsResponse, clientDetailResponse] = await Promise.all([
          apiRequest("GET", "/api/client-portal/admin/clients"),
          apiRequest("GET", `/api/client-portal/admin/clients/${data.clientAccountId}`),
        ]);

        const clients = (await clientsResponse.json()) as ClientAccount[];
        const clientDetail = await clientDetailResponse.json();

        if (!active) return;

        const selectedClient = clients.find((client) => client.id === data.clientAccountId);
        const projects = Array.isArray(clientDetail?.projects) ? (clientDetail.projects as ClientProject[]) : [];
        const selectedProject = projects.find((project) => project.id === data.projectId);

        setClientName(selectedClient?.name || clientDetail?.name || "");
        setProjectName(selectedProject?.name || "");
        setProjectDescription(
          selectedProject?.description ||
            selectedProject?.summary ||
            selectedProject?.brief ||
            "",
        );
      } catch (error) {
        console.error("Failed to load campaign context:", error);
      }
    };

    loadCampaignContext();
    return () => {
      active = false;
    };
  }, [data.clientAccountId, data.projectId]);

  const audienceCount = Number(data.audience?.estimatedCount || 0);
  const campaignName = data.name || "Untitled email campaign";

  const defaultAiBrief = useMemo(
    () =>
      buildDefaultAiBrief({
        campaignName,
        clientName,
        projectName,
        projectDescription,
        audienceCount,
      }),
    [audienceCount, campaignName, clientName, projectDescription, projectName],
  );

  useEffect(() => {
    if (!aiBrief.trim() && defaultAiBrief) {
      setAiBrief(defaultAiBrief);
    }
  }, [aiBrief, defaultAiBrief]);

  const selectedSender = useMemo(
    () => senderProfiles.find((profile) => profile.id === senderProfileId) || null,
    [senderProfileId, senderProfiles],
  );

  const contentText = useMemo(() => stripHtml(htmlContent), [htmlContent]);
  const bodyWordCount = contentText ? contentText.split(" ").length : 0;
  const hasDraft = contentText.length > 0;

  const readinessChecks = [
    {
      label: "Sender route selected",
      ready: Boolean(selectedSender),
      detail: selectedSender ? `${selectedSender.name} <${selectedSender.email}>` : "Choose who the campaign sends from.",
    },
    {
      label: "Campaign context grounded",
      ready: Boolean(aiBrief.trim()),
      detail: aiBrief.trim() ? "AI draft has enough context to generate a relevant first pass." : "Add campaign context for a stronger draft.",
    },
    {
      label: "Subject line ready",
      ready: Boolean(subject.trim()),
      detail: subject.trim() || "Subject line is still empty.",
    },
    {
      label: "Message drafted",
      ready: hasDraft,
      detail: hasDraft ? `${bodyWordCount} words drafted in the editor.` : "Write or generate the email body.",
    },
  ];

  const applyDraft = (draft: DraftPayload, origin: "manual" | "ai" | "template" | "existing") => {
    setSubject(draft.subject);
    setPreheader(draft.preheader);
    setHtmlContent(draft.htmlContent);
    setDraftOrigin(origin);
    setBuilderVersion((current) => current + 1);
    setValidationErrors([]);
  };

  const syncDraft = (draft: DraftPayload, origin: "manual" | "ai" | "template" | "existing" = "manual") => {
    setSubject(draft.subject);
    setPreheader(draft.preheader);
    setHtmlContent(draft.htmlContent);
    setDraftOrigin(origin);
  };

  const validateContent = () => {
    const errors: string[] = [];

    if (!subject.trim()) {
      errors.push("Subject line is required");
    }
    if (!stripHtml(htmlContent).trim()) {
      errors.push("Email content is required");
    }
    if (!senderProfileId) {
      errors.push("Sender profile must be selected");
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleGenerateAiDraft = async () => {
    if (!senderProfileId) {
      toast({
        title: "Choose a sender first",
        description: "The AI draft should be generated against the sender route you plan to use.",
        variant: "destructive",
      });
      return;
    }

    setAiGenerating(true);
    try {
      const response = await apiRequest("POST", "/api/ai/generate-email", {
        campaignName,
        outreachType: "cold-outreach",
        tone: "professional",
        context: aiBrief.trim(),
        senderName: selectedSender?.name || DEFAULT_ORGANIZATION_NAME,
        companyName: clientName || DEFAULT_ORGANIZATION_NAME,
        organizationId: data.organizationId,
        projectName,
        projectDescription,
        clientName,
      });

      const result = await response.json();
      applyDraft(
        {
          subject: result?.subject || subject,
          preheader: result?.rawContent?.preheader || preheader,
          htmlContent: result?.body || htmlContent,
        },
        result?.usedAi ? "ai" : "template",
      );

      toast({
        title: result?.usedAi ? "AI draft ready" : "Template draft ready",
        description: result?.usedAi
          ? "The first draft has been grounded in your campaign context. Refine it in the editor."
          : "AI was unavailable, so a structured fallback draft was applied.",
      });
    } catch (error: any) {
      console.error("Failed to generate AI draft:", error);
      toast({
        title: "AI draft failed",
        description: error?.message || "We could not generate the email draft. You can still write or load a template.",
        variant: "destructive",
      });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSuggestSubject = async () => {
    setSubjectSuggesting(true);
    try {
      const response = await apiRequest("POST", "/api/ai/suggest-subject", {
        campaignName,
        projectName,
        projectDescription,
        organizationId: data.organizationId,
        clientName,
      });
      const result = await response.json();

      if (result?.subject) {
        setSubject(result.subject);
        toast({
          title: "Subject suggested",
          description: "The AI suggested a sharper subject line. Edit it as needed.",
        });
      }
    } catch (error: any) {
      console.error("Failed to suggest subject:", error);
      toast({
        title: "Subject suggestion failed",
        description: error?.message || "We could not suggest a subject line right now.",
        variant: "destructive",
      });
    } finally {
      setSubjectSuggesting(false);
    }
  };

  const handleSelectTemplate = (template: EmailTemplate) => {
    applyDraft(
      {
        subject: template.id ? template.subject || subject : "",
        preheader: template.id ? preheader : "",
        htmlContent: template.id ? template.htmlContent || htmlContent : "",
      },
      "template",
    );

    toast({
      title: template.id ? "Template loaded" : "Blank draft opened",
      description: template.id
        ? `${template.name} is now loaded into the editor.`
        : "You are now starting from a blank draft.",
    });
  };

  const handleBuilderSave = (draft: DraftPayload) => {
    syncDraft(draft, draftOrigin === "existing" ? "manual" : draftOrigin);
    toast({
      title: "Draft saved",
      description: "Your message changes are synced into the campaign wizard.",
    });
  };

  const handleSendTest = async (emails: string[]) => {
    try {
      await apiRequest("POST", "/api/campaigns/send-test", {
        emails,
        subject,
        preheader,
        html: htmlContent,
        senderProfileId,
      });

      toast({
        title: "Test email sent",
        description: `Sent to ${emails.join(", ")}`,
      });
    } catch (error: any) {
      toast({
        title: "Test email failed",
        description: error?.message || "We could not send the test email.",
        variant: "destructive",
      });
    }
  };

  const handleContinue = () => {
    if (!validateContent()) {
      toast({
        title: "Complete the message first",
        description: "Resolve the issues in the content step before moving to scheduling.",
        variant: "destructive",
      });
      return;
    }

    onNext({
      content: {
        subject,
        preheader,
        html: htmlContent,
        senderProfileId,
        aiBrief,
        draftOrigin,
      },
    });
  };

  return (
    <div className="space-y-6">
      {validationErrors.length > 0 && (
        <Card className="rounded-[24px] border-rose-200 bg-rose-50/70 shadow-sm">
          <CardContent className="space-y-2 p-5">
            {validationErrors.map((error) => (
              <div key={error} className="flex items-center gap-2 text-sm text-rose-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-[28px] border-white/70 bg-white/90 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
              <CardHeader className="space-y-3 p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-950 p-3 text-white">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-slate-950">Sender Route</CardTitle>
                    <CardDescription>Pick the identity this campaign sends from before drafting the message.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-6 pt-0">
                {loadingSenders ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading sender profiles...
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">From</Label>
                      <Select value={senderProfileId} onValueChange={setSenderProfileId}>
                        <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-sm">
                          <SelectValue placeholder="Choose who this campaign comes from" />
                        </SelectTrigger>
                        <SelectContent>
                          {senderProfiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.name} &lt;{profile.email}&gt;
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedSender ? (
                      <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-950">
                              {selectedSender.name} &lt;{selectedSender.email}&gt;
                            </p>
                            <p className="text-xs text-slate-500">
                              Replies route to {selectedSender.replyToEmail || selectedSender.email}
                            </p>
                          </div>
                          <Badge
                            className={cn(
                              "border text-[11px]",
                              selectedSender.isVerified
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700",
                            )}
                          >
                            {selectedSender.isVerified ? "verified" : "review deliverability"}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-5 text-sm text-slate-500">
                        No sender profile is selected yet.
                      </div>
                    )}

                    {selectedSender && selectedSender.isVerified === false && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        This sender is not verified yet. You can still draft the message, but launch quality will be better with a verified route.
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-slate-900 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white shadow-[0_24px_70px_-40px_rgba(15,23,42,0.6)]">
              <CardHeader className="space-y-3 p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <Bot className="h-5 w-5 text-sky-200" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-white">AI Draft Studio</CardTitle>
                    <CardDescription className="text-slate-300">
                      Ground the first draft in campaign context, then refine it inside the editor.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-6 pt-0">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Context for the draft</Label>
                  <Textarea
                    value={aiBrief}
                    onChange={(event) => setAiBrief(event.target.value)}
                    placeholder="Describe the campaign goal, what the recipient should care about, and the CTA you want the email to drive."
                    className="min-h-[156px] rounded-2xl border-white/10 bg-white/5 text-sm text-white placeholder:text-slate-400"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleGenerateAiDraft}
                    disabled={aiGenerating}
                    className="gap-2 rounded-full bg-sky-400 px-5 text-slate-950 hover:bg-sky-300"
                  >
                    {aiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Generate AI Draft
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleSuggestSubject}
                    disabled={subjectSuggesting}
                    className="gap-2 rounded-full border border-white/10 bg-white/10 text-white hover:bg-white/15"
                  >
                    {subjectSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Suggest Subject
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowTemplateSelector(true)}
                    className="gap-2 rounded-full border border-white/10 bg-white/10 text-white hover:bg-white/15"
                  >
                    <LayoutTemplate className="h-4 w-4" />
                    Load Template
                  </Button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  {draftOrigin === "ai" && "AI drafted the current message. Refine the details before scheduling."}
                  {draftOrigin === "template" && "A template draft is loaded. Tailor it to the audience before scheduling."}
                  {draftOrigin === "existing" && "An existing draft is loaded into the editor."}
                  {draftOrigin === "manual" && "Start from the AI, a template, or write directly in the editor."}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden rounded-[32px] border-white/70 bg-white/95 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
            <CardHeader className="space-y-3 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-xl text-slate-950">Message Studio</CardTitle>
                  <CardDescription>
                    Draft, refine, and preview the email in one place. The wizard now stays synced with the editor as you work.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-full border-slate-200 px-3 py-1 text-xs text-slate-600">
                    {draftOrigin === "ai" ? "AI draft" : draftOrigin === "template" ? "Template draft" : "Manual draft"}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-slate-200 px-3 py-1 text-xs text-slate-600">
                    {bodyWordCount} words
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="border-t border-slate-100 p-0">
              <div className="h-[760px]">
                <EmailBuilderPro
                  key={`email-builder-${builderVersion}`}
                  initialSubject={subject}
                  initialPreheader={preheader}
                  initialHtml={htmlContent}
                  organizationName={clientName || DEFAULT_ORGANIZATION_NAME}
                  organizationAddress={DEFAULT_ORGANIZATION_ADDRESS}
                  sampleContacts={sampleContacts}
                  senderProfileId={senderProfileId}
                  onDraftChange={(draft) => syncDraft(draft, draftOrigin === "existing" ? "manual" : draftOrigin)}
                  onSave={handleBuilderSave}
                  onSendTest={handleSendTest}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 self-start">
          <Card className="rounded-[28px] border-slate-900 bg-slate-950 text-white shadow-[0_24px_70px_-40px_rgba(15,23,42,0.6)]">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/10 p-3">
                  <FolderKanban className="h-5 w-5 text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Campaign Story</p>
                  <p className="text-xs text-slate-300">The AI and the editor use this context as the operating frame for the message.</p>
                </div>
              </div>
              {[
                { label: "Campaign", value: campaignName },
                { label: "Client", value: clientName || "Linked in previous step" },
                { label: "Project", value: projectName || "Linked in previous step" },
                { label: "Audience", value: audienceCount > 0 ? `${audienceCount.toLocaleString()} contacts` : "Audience selected" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
                  <p className="mt-2 text-sm font-semibold">{item.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-white/70 bg-white/90 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-950">Live Snapshot</p>
                  <p className="text-xs text-slate-500">This updates as the editor changes, so the wizard always reflects the current draft.</p>
                </div>
              </div>

              <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Subject</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{subject || "No subject yet"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Preview Text</p>
                  <p className="mt-2 text-sm text-slate-700">{preheader || "No preview text yet"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sender</p>
                  <p className="mt-2 text-sm text-slate-700">
                    {selectedSender ? `${selectedSender.name} <${selectedSender.email}>` : "No sender selected"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Draft Status</p>
                  <p className="mt-2 text-sm text-slate-700">
                    {hasDraft ? `${bodyWordCount} words in the message body` : "The message body is still empty"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-white/70 bg-white/90 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-950">Readiness</p>
                  <p className="text-xs text-slate-500">Quick preflight before you move to scheduling.</p>
                </div>
              </div>

              <div className="space-y-3">
                {readinessChecks.map((check) => (
                  <div
                    key={check.label}
                    className={cn(
                      "rounded-2xl border p-4",
                      check.ready
                        ? "border-emerald-200 bg-emerald-50/70"
                        : "border-slate-200 bg-slate-50/80",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {check.ready ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{check.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{check.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          Back to Audience
        </Button>
        <Button onClick={handleContinue} size="lg" className="gap-2">
          Continue to Scheduling
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <TemplateSelectorModal
        open={showTemplateSelector}
        onOpenChange={setShowTemplateSelector}
        onSelectTemplate={handleSelectTemplate}
      />
    </div>
  );
}
