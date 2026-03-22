import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe } from "lucide-react";
import GenerationForm from "./shared/generation-form";
import ContentPreview from "./shared/content-preview";
import PublishDialog from "./shared/publish-dialog";
import ProxyFormSubmissionPanel from "./proxy-form-submission-panel";

import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

interface LandingPageTabProps {
  brandKits?: any[];
  orgIntelligence?: OrgIntelligenceProfile | null;
  organizationId?: string;
  clientProjectId?: string;
  campaignId?: string;
  /** When set, auto-loads an existing generative studio project for preview */
  preloadProjectId?: string;
}

export default function LandingPageTab({
  brandKits,
  orgIntelligence,
  organizationId,
  clientProjectId,
  campaignId,
  preloadProjectId,
}: LandingPageTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState(null);
  const [publishedSlug, setPublishedSlug] = useState(null);
  const [ctaGoal, setCtaGoal] = useState("");
  const [thankYouPageUrl, setThankYouPageUrl] = useState("/thank-you");
  const [assetUrl, setAssetUrl] = useState("");

  // Auto-load existing project content when preloadProjectId is provided (URL navigation)
  const { data: preloadedProject } = useQuery({
    queryKey: [`/api/generative-studio/projects/${preloadProjectId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/generative-studio/projects/${preloadProjectId}`);
      return res.json();
    },
    enabled: !!preloadProjectId && !result,
  });

  useEffect(() => {
    if (preloadedProject?.project && !result) {
      const p = preloadedProject.project;
      setProjectId(p.id);
      // Build the result object matching the generate mutation output shape
      setResult({
        html: p.generatedContentHtml || p.generatedContent || null,
        metaTitle: (p.metadata as any)?.metaTitle || p.title || null,
        metaDescription: (p.metadata as any)?.metaDescription || null,
        title: p.title || null,
      });
      // If already published, set the published URL
      if (p.status === "published" && (p.metadata as any)?.publishedUrl) {
        const pubUrl = (p.metadata as any).publishedUrl;
        setPublishedUrl(pubUrl);
        setPublishedSlug(parsePublishedSlug(pubUrl));
      }
    }
  }, [preloadedProject]);
  const projectsQueryKey = `/api/generative-studio/projects?organizationId=${organizationId || ""}&clientProjectId=${clientProjectId || ""}`;

  const { data: submissionStats, isLoading: submissionsLoading } = useQuery({
    queryKey: ["/api/generative-studio/published", publishedSlug, "submissions"],
    enabled: !!publishedSlug,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/generative-studio/published/${encodeURIComponent(publishedSlug as string)}/submissions?limit=10`);
      return res.json();
    },
  });

  const { data: campaignDetails } = useQuery({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/campaigns/${campaignId}`);
      return res.json();
    },
  });

  const prefilledPrompt = campaignDetails
    ? [
        campaignDetails.campaignObjective ? `Campaign objective: ${campaignDetails.campaignObjective}` : null,
        campaignDetails.productServiceInfo ? `Product / service details: ${campaignDetails.productServiceInfo}` : null,
        campaignDetails.targetAudienceDescription ? `Target audience: ${campaignDetails.targetAudienceDescription}` : null,
        campaignDetails.campaignContextBrief ? `Campaign context brief: ${campaignDetails.campaignContextBrief}` : null,
        Array.isArray(campaignDetails.talkingPoints) && campaignDetails.talkingPoints.length > 0
          ? `Talking points: ${campaignDetails.talkingPoints.join("; ")}`
          : null,
        Array.isArray(campaignDetails.campaignObjections) && campaignDetails.campaignObjections.length > 0
          ? `Common objections and responses: ${campaignDetails.campaignObjections.map((item: any) => {
              if (item?.objection || item?.response) {
                return `${item?.objection || "Objection"}: ${item?.response || ""}`.trim();
              }
              return String(item);
            }).join("; ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const prefilledAdditionalContext = campaignDetails
    ? [
        campaignDetails.successCriteria ? `Success criteria: ${campaignDetails.successCriteria}` : null,
        campaignDetails.landingPageUrl ? `Existing landing page URL (for reference): ${campaignDetails.landingPageUrl}` : null,
        campaignDetails.projectFileUrl ? `Project brief / file URL (for reference): ${campaignDetails.projectFileUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const derivedAssetUrl = campaignDetails?.projectFileUrl || "";

  const parsePublishedSlug = (url: string | undefined | null): string | null => {
    const raw = String(url || "").trim();
    if (!raw) return null;
    const matched = raw.match(/\/generative-studio\/public\/([^/?#]+)/i) || raw.match(/\/api\/generative-studio\/public\/([^/?#]+)/i);
    return matched?.[1] ? decodeURIComponent(matched[1]) : null;
  };

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(
        "POST",
        "/api/generative-studio/generate/landing-page",
        data,
        { timeout: 180000 }
      );
      return await res.json();
    },
    onSuccess: (data) => {
      setResult(data.content);
      setProjectId(data.projectId);
      queryClient.invalidateQueries({ queryKey: [projectsQueryKey] });
      toast({ title: "Landing page generated!" });
    },
    onError: (error: any) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/generative-studio/publish/${projectId}`, {
        ...data,
        organizationId,
        clientProjectId,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setPublishOpen(false);
      const url = String(data?.url || "").trim();
      setPublishedUrl(url || null);
      setPublishedSlug(parsePublishedSlug(url));
      toast({ title: "Landing page published!", description: `Available at ${data.url}` });
    },
    onError: (error: any) => {
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
    },
  });

  const saveAsAssetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/generative-studio/save-as-asset/${projectId}`, {
        organizationId,
        clientProjectId,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved to content library!" });
    },
  });

  const handleGenerate = (params: Record) => {
    generateMutation.mutate({
      ...params,
      ctaGoal: ctaGoal || undefined,
      thankYouPageUrl: thankYouPageUrl || '/thank-you',
      assetUrl: assetUrl || derivedAssetUrl || undefined,
      organizationId,
      clientProjectId,
    });
  };

  return (
    
      {/* Left panel - Form */}
      
        
          
            
          
          
            Landing Page
            Generate and publish pages
          
        

        
              CTA Goal
               setCtaGoal(e.target.value)}
                disabled={!organizationId}
              />

              Thank You Page URL
               setThankYouPageUrl(e.target.value)}
                disabled={!organizationId}
              />

              Asset Download/View URL
               setAssetUrl(e.target.value)}
                disabled={!organizationId}
              />
            
          }
        />

        {publishedUrl && (
          
            Published Landing Page
            
              {publishedUrl}
            

            
              
                Form Submissions
                {submissionStats?.totalSubmissions ?? 0}
              

              {submissionsLoading ? (
                Loading submissions...
              ) : (submissionStats?.recentSubmissions?.length ?? 0) > 0 ? (
                
                  {submissionStats.recentSubmissions.map((row: any) => {
                    const displayName = [row?.visitorFirstName, row?.visitorLastName].filter(Boolean).join(' ') || row?.formData?.submitterName || 'Unknown';
                    return (
                      
                        {displayName}
                        {row?.visitorEmail || row?.formData?.submitterEmail || 'No email'}
                        
                          {new Date(row.createdAt).toLocaleString()}
                        
                      
                    );
                  })}
                
              ) : (
                No submissions yet.
              )}
            
          
        )}

        {/* Proxy form submission panel (visible when campaign + published page exist) */}
        {publishedSlug && campaignId && (
          
            
          
        )}
      

      {/* Right panel - Preview */}
      
         setPublishOpen(true)}
          onSaveAsAsset={projectId ? () => saveAsAssetMutation.mutate() : undefined}
        />
      

      {/* Publish Dialog */}
       publishMutation.mutate(data)}
        isPublishing={publishMutation.isPending}
        title={result?.title || "Landing Page"}
        contentType="landing_page"
        organizationId={organizationId}
      />
    
  );
}