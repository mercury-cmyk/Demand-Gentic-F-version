/**
 * CampaignIntentForm - Page 1 of Simple Campaign Builder
 *
 * Collects campaign intent: name, sender settings, subject line,
 * and links to a client + project for contextual email generation.
 */

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Mail, ArrowRight, User, AlertCircle, CheckCircle2, Building2, FolderOpen } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SenderProfile {
  id: string;
  name: string;
  email: string;
  replyTo?: string;
  isVerified: boolean;
}

interface ClientAccount {
  id: string;
  name: string;
  companyName?: string;
}

interface ClientProject {
  id: string;
  name: string;
  status: string;
  description?: string;
  campaignOrganizationId?: string;
}

export interface CampaignIntent {
  campaignName: string;
  senderProfileId: string;
  senderName: string;
  fromEmail: string;
  replyToEmail: string;
  subject: string;
  // Client & Project context
  clientAccountId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  projectDescription?: string;
  campaignOrganizationId?: string;
}

interface CampaignIntentFormProps {
  initialData?: Partial<CampaignIntent>;
  onNext: (data: CampaignIntent) => void;
  onCancel: () => void;
}

export function CampaignIntentForm({ initialData, onNext, onCancel }: CampaignIntentFormProps) {
  const { toast } = useToast();

  // Form state
  const [campaignName, setCampaignName] = useState(initialData?.campaignName || "");
  const [senderProfileId, setSenderProfileId] = useState(initialData?.senderProfileId || "");
  const [subject, setSubject] = useState(initialData?.subject || "");

  // Sender profile state
  const [senderProfiles, setSenderProfiles] = useState<SenderProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<SenderProfile | null>(null);

  // Client & project state
  const [clientAccounts, setClientAccounts] = useState<ClientAccount[]>([]);
  const [clientProjects, setClientProjects] = useState<ClientProject[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(initialData?.clientAccountId || "");
  const [selectedProjectId, setSelectedProjectId] = useState(initialData?.projectId || "");
  const [selectedProject, setSelectedProject] = useState<ClientProject | null>(null);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // AI suggestion state
  const [aiSuggesting, setAiSuggesting] = useState(false);

  // Fetch sender profiles
  useEffect(() => {
    const fetchSenderProfiles = async () => {
      try {
        setLoadingProfiles(true);
        const res = await apiRequest("GET", "/api/sender-profiles");
        const profiles = await res.json();
        setSenderProfiles(profiles || []);

        if (!senderProfileId && profiles?.length > 0) {
          const verifiedProfile = profiles.find((p: SenderProfile) => p.isVerified);
          if (verifiedProfile) {
            setSenderProfileId(verifiedProfile.id);
            setSelectedProfile(verifiedProfile);
          }
        } else if (senderProfileId) {
          const existing = profiles.find((p: SenderProfile) => p.id === senderProfileId);
          if (existing) setSelectedProfile(existing);
        }
      } catch (error) {
        console.error("Failed to fetch sender profiles:", error);
      } finally {
        setLoadingProfiles(false);
      }
    };
    fetchSenderProfiles();
  }, []);

  // Fetch client accounts
  useEffect(() => {
    const fetchClients = async () => {
      setLoadingClients(true);
      try {
        const res = await apiRequest("GET", "/api/client-portal/admin/clients");
        if (!res.ok) throw new Error("Failed to load clients");
        const data = await res.json();
        setClientAccounts(data || []);
      } catch (error) {
        console.error("Failed to load clients:", error);
        setClientAccounts([]);
      } finally {
        setLoadingClients(false);
      }
    };
    fetchClients();
  }, []);

  // Fetch projects when client changes
  useEffect(() => {
    if (!selectedClientId) {
      setClientProjects([]);
      setSelectedProjectId("");
      setSelectedProject(null);
      return;
    }
    let active = true;
    const fetchProjects = async () => {
      setLoadingProjects(true);
      try {
        const res = await apiRequest("GET", `/api/client-portal/admin/clients/${selectedClientId}`);
        if (!res.ok) throw new Error("Failed to load projects");
        const data = await res.json();
        if (!active) return;
        const projects: ClientProject[] = data?.projects || [];
        setClientProjects(projects);
        // Keep existing selection if valid
        if (selectedProjectId && projects.some(p => p.id === selectedProjectId)) {
          setSelectedProject(projects.find(p => p.id === selectedProjectId) || null);
        } else if (projects.length > 0) {
          setSelectedProjectId(projects[0].id);
          setSelectedProject(projects[0]);
        } else {
          setSelectedProjectId("");
          setSelectedProject(null);
        }
      } catch (error) {
        console.error("Failed to load projects:", error);
        if (active) {
          setClientProjects([]);
          setSelectedProjectId("");
          setSelectedProject(null);
        }
      } finally {
        if (active) setLoadingProjects(false);
      }
    };
    fetchProjects();
    return () => { active = false; };
  }, [selectedClientId]);

  // Keep selectedProject in sync when project dropdown changes
  useEffect(() => {
    if (selectedProjectId) {
      const project = clientProjects.find(p => p.id === selectedProjectId);
      setSelectedProject(project || null);
    } else {
      setSelectedProject(null);
    }
  }, [selectedProjectId, clientProjects]);

  const handleProfileChange = (profileId: string) => {
    setSenderProfileId(profileId);
    const profile = senderProfiles.find(p => p.id === profileId);
    setSelectedProfile(profile || null);
  };

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    setSelectedProjectId("");
    setSelectedProject(null);
  };

  // AI Subject suggestion - uses project/org context
  const handleAiSuggestSubject = async () => {
    if (!campaignName.trim()) {
      toast({
        title: "Campaign name needed",
        description: "Enter a campaign name first to get AI suggestions",
        variant: "destructive"
      });
      return;
    }

    setAiSuggesting(true);
    try {
      const res = await apiRequest("POST", "/api/ai/suggest-subject", {
        campaignName,
        projectName: selectedProject?.name,
        projectDescription: selectedProject?.description,
        organizationId: selectedProject?.campaignOrganizationId,
        clientName: clientAccounts.find(c => c.id === selectedClientId)?.name
      });
      const data = await res.json();
      if (data.subject) {
        setSubject(data.subject);
      }
    } catch (error) {
      // Fallback: generate a simple subject from campaign name
      const words = campaignName.split(" ").slice(0, 4).join(" ");
      setSubject(`Quick question about ${words}`);
    } finally {
      setAiSuggesting(false);
    }
  };

  // Validation - require client + project
  const isValid = campaignName.trim() && senderProfileId && subject.trim() && selectedClientId && selectedProjectId;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !selectedProfile) return;

    const client = clientAccounts.find(c => c.id === selectedClientId);

    onNext({
      campaignName: campaignName.trim(),
      senderProfileId,
      senderName: selectedProfile.name,
      fromEmail: selectedProfile.email,
      replyToEmail: selectedProfile.replyTo || selectedProfile.email,
      subject: subject.trim(),
      clientAccountId: selectedClientId,
      clientName: client?.name || client?.companyName || "",
      projectId: selectedProjectId,
      projectName: selectedProject?.name || "",
      projectDescription: selectedProject?.description,
      campaignOrganizationId: selectedProject?.campaignOrganizationId,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-xl mx-auto">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
            Create Email Campaign
          </h1>
          <p className="mt-2 text-slate-500">
            Define your campaign intent. Build the message next.
          </p>
        </div>

        <Card className="shadow-lg border-slate-200">
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-8">

              {/* Client & Project Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <Label className="text-sm font-semibold text-slate-700">Client & Project</Label>
                </div>
                <p className="text-xs text-slate-400 -mt-2">
                  Link this campaign to a client and project to align email content with project goals.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  {/* Client Select */}
                  <div className="space-y-2">
                    <Label htmlFor="client" className="text-xs font-medium text-slate-500">
                      Client <span className="text-red-500">*</span>
                    </Label>
                    {loadingClients ? (
                      <div className="flex items-center justify-center h-10 bg-slate-50 rounded-md border">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      </div>
                    ) : (
                      <Select value={selectedClientId} onValueChange={handleClientChange}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                        <SelectContent>
                          {clientAccounts.length === 0 ? (
                            <div className="p-3 text-sm text-slate-500">No clients found</div>
                          ) : (
                            clientAccounts.map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.name || client.companyName}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Project Select */}
                  <div className="space-y-2">
                    <Label htmlFor="project" className="text-xs font-medium text-slate-500">
                      Project <span className="text-red-500">*</span>
                    </Label>
                    {!selectedClientId ? (
                      <div className="h-10 flex items-center px-3 text-xs text-slate-400 bg-slate-50 border rounded-md">
                        Select client first
                      </div>
                    ) : loadingProjects ? (
                      <div className="flex items-center justify-center h-10 bg-slate-50 rounded-md border">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      </div>
                    ) : (
                      <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                        <SelectContent>
                          {clientProjects.length === 0 ? (
                            <div className="p-3 text-sm text-slate-500">No projects found</div>
                          ) : (
                            clientProjects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {/* Project details badge */}
                {selectedProject && (
                  <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <FolderOpen className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-blue-800">{selectedProject.name}</p>
                      {selectedProject.description && (
                        <p className="text-xs text-blue-600 mt-0.5 line-clamp-2">{selectedProject.description}</p>
                      )}
                      {selectedProject.campaignOrganizationId && (
                        <Badge variant="secondary" className="mt-1 text-[10px] h-4 bg-blue-100 text-blue-700 border-blue-200">
                          <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                          Org intelligence linked
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Campaign Name */}
              <div className="space-y-2">
                <Label htmlFor="campaignName" className="text-sm font-semibold text-slate-700">
                  Campaign Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="campaignName"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Q1 ABM Outreach – Finance Leaders"
                  className="h-12 text-base"
                  autoFocus
                />
                <p className="text-xs text-slate-400">Internal name for tracking. Not visible to recipients.</p>
              </div>

              {/* Sender Settings Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <User className="w-4 h-4 text-slate-400" />
                  <Label className="text-sm font-semibold text-slate-700">Sender Settings</Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="senderProfile" className="text-xs font-medium text-slate-500">
                    Sender Profile <span className="text-red-500">*</span>
                  </Label>
                  {loadingProfiles ? (
                    <div className="flex items-center justify-center h-12 bg-slate-50 rounded-md border">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    </div>
                  ) : (
                    <Select value={senderProfileId} onValueChange={handleProfileChange}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select a verified sender" />
                      </SelectTrigger>
                      <SelectContent>
                        {senderProfiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{profile.name}</span>
                              <span className="text-slate-400">&lt;{profile.email}&gt;</span>
                              {profile.isVerified ? (
                                <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-green-50 text-green-700 border-green-200">
                                  <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                  Verified
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-amber-50 text-amber-700 border-amber-200">
                                  <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                                  Unverified
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {selectedProfile && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">From Name</Label>
                      <p className="text-sm font-medium text-slate-700 mt-1">{selectedProfile.name}</p>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">From Email</Label>
                      <p className="text-sm font-medium text-slate-700 mt-1">{selectedProfile.email}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Reply-To</Label>
                      <p className="text-sm font-medium text-slate-700 mt-1">{selectedProfile.replyTo || selectedProfile.email}</p>
                    </div>
                  </div>
                )}

                {senderProfiles.length === 0 && !loadingProfiles && (
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">No sender profiles found</span>
                    </div>
                    <p className="text-xs text-amber-600 mt-1">
                      Create a sender profile in Settings → Sender Profiles to continue.
                    </p>
                  </div>
                )}
              </div>

              {/* Subject Line */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="subject" className="text-sm font-semibold text-slate-700">
                    Subject Line <span className="text-red-500">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAiSuggestSubject}
                    disabled={aiSuggesting}
                    className="text-xs h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    {aiSuggesting ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Thinking...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 mr-1" />
                        AI Suggest
                      </>
                    )}
                  </Button>
                </div>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Quick question about..."
                  className="h-12 text-base"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    Keep it under 60 characters for best visibility
                  </p>
                  <span className={`text-xs ${subject.length > 60 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                    {subject.length}/60
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={!isValid}
                  className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700"
                >
                  <Mail className="w-5 h-5 mr-2" />
                  Create Email Template
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>

              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  onClick={onCancel}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel and go back
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 mt-6">
          This is step 1 of 3. You'll design the email content next.
        </p>
      </div>
    </div>
  );
}

export default CampaignIntentForm;
