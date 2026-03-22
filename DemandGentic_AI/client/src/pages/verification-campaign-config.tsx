import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { ArrowLeft, Save, ShieldX, Upload, Eye, Trash2, FileText, X, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AccountCapManager } from "@/components/verification/AccountCapManager";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const SENIORITY_LEVELS = [
  { value: "executive", label: "Executive (C-Suite, President, Founder)" },
  { value: "vp", label: "VP (Vice President, SVP, EVP)" },
  { value: "director", label: "Director (Head of, Director)" },
  { value: "manager", label: "Manager (Manager, Lead, Supervisor)" },
  { value: "ic", label: "Individual Contributor" },
] as const;

const COMMON_COUNTRIES = [
  "United States", "Canada", "United Kingdom", "Australia", "Germany", 
  "France", "India", "Singapore", "Japan", "Netherlands", "Ireland",
  "Sweden", "Switzerland", "Brazil", "Mexico", "Spain", "Italy",
  "Belgium", "Denmark", "Norway", "Finland", "New Zealand", "Austria",
  "Hong Kong", "South Korea", "Poland", "Czech Republic", "Israel",
  "United Arab Emirates", "South Africa", "Malaysia", "Philippines",
  "Indonesia", "Thailand", "Vietnam", "China", "Taiwan", "Portugal"
] as const;
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function VerificationCampaignConfigPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isNew = id === "new";
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["/api/verification-campaigns", id],
    enabled: !isNew,
  });

  const [formData, setFormData] = useState({
    name: "",
    monthlyTarget: 1000,
    leadCapPerAccount: 10,
    geoAllow: [] as string[],
    titleKeywords: "",
    seniorityLevels: [] as string[],
    industryKeywords: "",
    requireEmailNameMatch: false,
    titleMatchMode: "contains" as "contains" | "exact" | "word_boundary",
    okRateTarget: 0.95,
    deliverabilityTarget: 0.97,
    // Contact realness checks
    rejectFakeNames: false,
    rejectSelfEmployed: false,
    rejectMissingIndustry: false,
    rejectMissingCompanyLinkedIn: false,
    rejectFreemailWithTitle: false,
    rejectMissingTenure: false,
  });

  useEffect(() => {
    if (campaign && !isLoading) {
      const config = (campaign as any).eligibilityConfig || {};
      setFormData({
        name: (campaign as any).name,
        monthlyTarget: (campaign as any).monthlyTarget,
        leadCapPerAccount: (campaign as any).leadCapPerAccount,
        geoAllow: config.geoAllow || [],
        titleKeywords: config.titleKeywords?.join("\n") || "",
        seniorityLevels: config.seniorityLevels || [],
        industryKeywords: config.industryKeywords?.join("\n") || "",
        requireEmailNameMatch: config.requireEmailNameMatch || false,
        titleMatchMode: config.titleMatchMode || "contains",
        okRateTarget: Number((campaign as any).okRateTarget),
        deliverabilityTarget: Number((campaign as any).deliverabilityTarget),
        // Contact realness checks
        rejectFakeNames: config.rejectFakeNames || false,
        rejectSelfEmployed: config.rejectSelfEmployed || false,
        rejectMissingIndustry: config.rejectMissingIndustry || false,
        rejectMissingCompanyLinkedIn: config.rejectMissingCompanyLinkedIn || false,
        rejectFreemailWithTitle: config.rejectFreemailWithTitle || false,
        rejectMissingTenure: config.rejectMissingTenure || false,
      });
    }
  }, [campaign, isLoading]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const eligibilityConfig: any = {};
      
      if (data.geoAllow?.length > 0) {
        eligibilityConfig.geoAllow = data.geoAllow;
      }
      
      if (data.titleKeywords?.trim()) {
        eligibilityConfig.titleKeywords = data.titleKeywords.split("\n").filter((s: string) => s.trim());
      }
      
      if (data.seniorityLevels?.length > 0) {
        eligibilityConfig.seniorityLevels = data.seniorityLevels;
      }
      
      if (data.industryKeywords?.trim()) {
        eligibilityConfig.industryKeywords = data.industryKeywords.split("\n").filter((s: string) => s.trim());
      }
      
      eligibilityConfig.requireEmailNameMatch = data.requireEmailNameMatch || false;
      eligibilityConfig.titleMatchMode = data.titleMatchMode || "contains";
      
      // Contact realness checks
      eligibilityConfig.rejectFakeNames = data.rejectFakeNames || false;
      eligibilityConfig.rejectSelfEmployed = data.rejectSelfEmployed || false;
      eligibilityConfig.rejectMissingIndustry = data.rejectMissingIndustry || false;
      eligibilityConfig.rejectMissingCompanyLinkedIn = data.rejectMissingCompanyLinkedIn || false;
      eligibilityConfig.rejectFreemailWithTitle = data.rejectFreemailWithTitle || false;
      eligibilityConfig.rejectMissingTenure = data.rejectMissingTenure || false;
      
      const payload = {
        ...data,
        eligibilityConfig: Object.keys(eligibilityConfig).length > 0 ? eligibilityConfig : null,
      };

      if (isNew) {
        const res = await apiRequest("POST", `/api/verification-campaigns`, payload);
        return res.json();
      } else {
        const res = await apiRequest("PUT", `/api/verification-campaigns/${id}`, payload);
        return res.json();
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `Campaign ${isNew ? "created" : "updated"} successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns"] });
      if (isNew) {
        navigate("/verification/campaigns");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save campaign",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/verification-campaigns/${id}`);
      // DELETE endpoint returns 204 No Content, so we don't try to parse JSON
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to delete campaign" }));
        throw new Error(error?.error || error?.message || "Failed to delete campaign");
      }
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Campaign deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns"] });
      navigate("/verification/campaigns");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete campaign",
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate();
    setShowDeleteDialog(false);
  };

  // Suppression list state and queries
  const fileInputRef = useRef(null);
  const [suppressionFile, setSuppressionFile] = useState(null);

  const { data: suppressionList, isLoading: suppressionLoading } = useQuery({
    queryKey: [`/api/verification-campaigns/${id}/suppression`],
    enabled: !isNew && !!id,
  });

  const uploadSuppressionMutation = useMutation({
    mutationFn: async (csvData: string) => {
      const res = await apiRequest("POST", `/api/verification-campaigns/${id}/suppression/upload`, { csvData });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Suppression list uploaded successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/verification-campaigns/${id}/suppression`] });
      setSuppressionFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload suppression list",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent) => {
    const file = e.target.files?.[0];
    if (file) {
      setSuppressionFile(file);
    }
  };

  const handleUploadSuppression = async () => {
    if (!suppressionFile) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const csvData = e.target?.result as string;
      uploadSuppressionMutation.mutate(csvData);
    };
    reader.readAsText(suppressionFile);
  };

  if (isLoading && !isNew) {
    return Loading...;
  }

  return (
    
      
         navigate("/verification/campaigns")}
          data-testid="button-back"
        >
          
          Back
        
        
          
            {isNew ? "New Verification Campaign" : `Configure: ${(campaign as any)?.name}`}
          
          
            Set up eligibility rules and account caps
          
        
      

      
        
          Campaign Details
          Basic campaign information and targets
        
        
          
            Campaign Name
             setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., CAT62542 or Q1-2025-Enterprise"
              data-testid="input-campaign-name"
            />
          
          
            
              Monthly Target
               setFormData({ ...formData, monthlyTarget: Number(e.target.value) })}
                data-testid="input-monthly-target"
              />
            
            
              Lead Cap per Account
               setFormData({ ...formData, leadCapPerAccount: Number(e.target.value) })}
                data-testid="input-lead-cap"
              />
            
          
        
      

      
        
          Eligibility Rules
          Define which contacts are eligible for this campaign (all fields optional)
        
        
          {/* Geography Selection */}
          
            Allowed Geographies (Optional)
            
              
                
                  
                    {formData.geoAllow.length === 0
                      ? "Select countries..."
                      : `${formData.geoAllow.length} countries selected`}
                  
                  
                
              
              
                
                   {
                      const searchEl = e.target.closest('.p-2')?.nextElementSibling;
                      if (searchEl) {
                        const items = searchEl.querySelectorAll('[data-country]');
                        items.forEach((item) => {
                          const country = item.getAttribute('data-country')?.toLowerCase() || '';
                          const match = country.includes(e.target.value.toLowerCase());
                          (item as HTMLElement).style.display = match ? '' : 'none';
                        });
                      }
                    }}
                  />
                
                
                  
                    {COMMON_COUNTRIES.map((country) => (
                       {
                          setFormData(prev => ({
                            ...prev,
                            geoAllow: prev.geoAllow.includes(country)
                              ? prev.geoAllow.filter(c => c !== country)
                              : [...prev.geoAllow, country]
                          }));
                        }}
                        data-testid={`checkbox-geo-${country.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                         {
                            setFormData(prev => ({
                              ...prev,
                              geoAllow: checked
                                ? [...prev.geoAllow, country]
                                : prev.geoAllow.filter(c => c !== country)
                            }));
                          }}
                        />
                        {country}
                      
                    ))}
                  
                
                {formData.geoAllow.length > 0 && (
                  
                    
                      {formData.geoAllow.length} selected
                    
                     setFormData(prev => ({ ...prev, geoAllow: [] }))}
                      data-testid="button-clear-geo"
                    >
                      Clear all
                    
                  
                )}
              
            
            {formData.geoAllow.length > 0 && (
              
                {formData.geoAllow.map((country) => (
                  
                    {country}
                     setFormData(prev => ({
                        ...prev,
                        geoAllow: prev.geoAllow.filter(c => c !== country)
                      }))}
                    />
                  
                ))}
              
            )}
            
              Leave empty to allow all geographies
            
          

          {/* Seniority Level Selection */}
          
            Target Seniority Levels (Optional)
            
              
                
                  
                    {formData.seniorityLevels.length === 0
                      ? "Select seniority levels..."
                      : `${formData.seniorityLevels.length} levels selected`}
                  
                  
                
              
              
                
                  {SENIORITY_LEVELS.map((level) => (
                     {
                        setFormData(prev => ({
                          ...prev,
                          seniorityLevels: prev.seniorityLevels.includes(level.value)
                            ? prev.seniorityLevels.filter(l => l !== level.value)
                            : [...prev.seniorityLevels, level.value]
                        }));
                      }}
                      data-testid={`checkbox-seniority-${level.value}`}
                    >
                       {
                          setFormData(prev => ({
                            ...prev,
                            seniorityLevels: checked
                              ? [...prev.seniorityLevels, level.value]
                              : prev.seniorityLevels.filter(l => l !== level.value)
                          }));
                        }}
                      />
                      {level.label}
                    
                  ))}
                
                {formData.seniorityLevels.length > 0 && (
                  
                    
                      {formData.seniorityLevels.length} selected
                    
                     setFormData(prev => ({ ...prev, seniorityLevels: [] }))}
                      data-testid="button-clear-seniority"
                    >
                      Clear all
                    
                  
                )}
              
            
            {formData.seniorityLevels.length > 0 && (
              
                {formData.seniorityLevels.map((level) => {
                  const levelInfo = SENIORITY_LEVELS.find(l => l.value === level);
                  return (
                    
                      {levelInfo?.label.split(' (')[0] || level}
                       setFormData(prev => ({
                          ...prev,
                          seniorityLevels: prev.seniorityLevels.filter(l => l !== level)
                        }))}
                      />
                    
                  );
                })}
              
            )}
            
              Filter contacts by seniority level extracted from job title. Leave empty to allow all levels.
            
          

          {/* Title Keywords with Match Mode */}
          
            
              Title Keywords (Optional - one per line)
              
                Match Mode:
                 setFormData({ ...formData, titleMatchMode: e.target.value as any })}
                  className="text-xs border rounded px-2 py-1 bg-background"
                  data-testid="select-title-match-mode"
                >
                  Contains
                  Word Boundary
                  Exact Match
                
              
            
             setFormData({ ...formData, titleKeywords: e.target.value })}
              placeholder="director&#10;manager&#10;vp"
              data-testid="input-title-keywords"
              className="mt-1.5"
            />
            
              {formData.titleMatchMode === "contains" && "Matches if title contains keyword anywhere (e.g., 'Sales Director' matches 'director')"}
              {formData.titleMatchMode === "word_boundary" && "Matches whole words only (e.g., 'Director' matches but 'Directors' does not)"}
              {formData.titleMatchMode === "exact" && "Requires exact title match (case-insensitive)"}
            
          

          {/* Industry Keywords */}
          
            Industry Keywords (Optional - one per line)
             setFormData({ ...formData, industryKeywords: e.target.value })}
              placeholder="technology&#10;software&#10;healthcare&#10;financial services"
              data-testid="input-industry-keywords"
              className="mt-1.5"
            />
            
              Filter contacts whose company industry or description matches these keywords. Leave empty to allow all industries.
            
          

          {/* Email-Name Match Requirement */}
          
            
              Require Email-Name Match
              
                Flag contacts where the email address doesn't appear to match the contact's name
              
            
             setFormData({ ...formData, requireEmailNameMatch: checked })}
              data-testid="switch-email-name-match"
            />
          
        
      

      {/* Contact Realness Checks Card */}
      
        
          Contact Quality Filters
          
            Filter out low-quality or fake contacts that don't meet business standards
          
        
        
          {/* Reject Fake Names */}
          
            
              Reject Fake Names
              
                Exclude contacts with names that appear fake (e.g., company names used as person names, all-caps, numbers)
              
            
             setFormData({ ...formData, rejectFakeNames: checked })}
              data-testid="switch-reject-fake-names"
            />
          

          {/* Reject Self-Employed */}
          
            
              Reject Self-Employed
              
                Exclude freelancers, consultants, contractors, and self-employed contacts
              
            
             setFormData({ ...formData, rejectSelfEmployed: checked })}
              data-testid="switch-reject-self-employed"
            />
          

          {/* Reject Missing Industry */}
          
            
              Reject Missing Industry
              
                Exclude contacts whose company has no industry information
              
            
             setFormData({ ...formData, rejectMissingIndustry: checked })}
              data-testid="switch-reject-missing-industry"
            />
          

          {/* Reject Missing Company LinkedIn */}
          
            
              Reject Missing Company LinkedIn
              
                Exclude contacts whose company has no LinkedIn page
              
            
             setFormData({ ...formData, rejectMissingCompanyLinkedIn: checked })}
              data-testid="switch-reject-missing-linkedin"
            />
          

          {/* Reject Freemail with Business Title */}
          
            
              Reject Personal Email + Business Title
              
                Exclude contacts using personal email (Gmail, Yahoo) but claiming business titles (Director, VP, Manager)
              
            
             setFormData({ ...formData, rejectFreemailWithTitle: checked })}
              data-testid="switch-reject-freemail-title"
            />
          

          {/* Reject Missing Tenure */}
          
            
              Reject Missing Tenure
              
                Exclude contacts with no tenure data (unknown time in position or time in company)
              
            
             setFormData({ ...formData, rejectMissingTenure: checked })}
              data-testid="switch-reject-missing-tenure"
            />
          
        
      

      
        
          Quality Targets
          Set quality thresholds for this campaign
        
        
          
            
              OK Email Rate Target
               setFormData({ ...formData, okRateTarget: Number(e.target.value) })}
                data-testid="input-ok-rate"
              />
              Target: 0.95 (95%)
            
            
              Deliverability Target
               setFormData({ ...formData, deliverabilityTarget: Number(e.target.value) })}
                data-testid="input-deliverability"
              />
              Target: 0.97 (97%)
            
          
        
      

      {!isNew && (
        
          
            
              
                
                  
                  Suppression List
                
                
                  Upload a CSV file to exclude specific contacts from this campaign
                
              
              
                {suppressionList ? (suppressionList as any[]).length : 0} entries
              
            
          
          
            {/* Upload Section */}
            
              
                
                  
                    Upload CSV File
                    
                      Supports: Email, CAV ID, CAV User ID, or Full Name + Company Name
                    
                    
                    {suppressionFile && (
                      
                        
                        
                          {suppressionFile.name}
                        
                      
                    )}
                  
                  
                    
                    {uploadSuppressionMutation.isPending ? "Uploading..." : "Upload"}
                  
                
                
                
                  CSV Format Requirements:
                  
                    Headers: email, cavId, cavUserId, firstName, lastName, companyName
                    Each row must have: email OR cavId OR cavUserId OR (firstName + companyName)
                    Supports comma, tab, pipe, or semicolon delimiters (auto-detected)
                  
                
              
            

            {/* Current Entries */}
            {suppressionLoading ? (
              
                Loading suppression list...
              
            ) : suppressionList && (suppressionList as any[]).length > 0 ? (
              
                
                  Current Suppression Entries
                
                
                  
                    
                      
                        Type
                        Identifier
                        Added
                      
                    
                    
                      {(suppressionList as any[]).slice(0, 100).map((entry: any) => (
                        
                          
                            {entry.emailLower && Email}
                            {entry.cavId && CAV ID}
                            {entry.cavUserId && User ID}
                            {entry.nameCompanyHash && Name+Company}
                          
                          
                            {entry.emailLower || entry.cavId || entry.cavUserId || entry.nameCompanyHash?.substring(0, 16) + '...'}
                          
                          
                            {new Date(entry.addedAt).toLocaleDateString()}
                          
                        
                      ))}
                    
                  
                
                {(suppressionList as any[]).length > 100 && (
                  
                    Showing first 100 of {(suppressionList as any[]).length} entries
                  
                )}
              
            ) : (
              
                
                No suppression entries yet
                Upload a CSV file to exclude contacts from this campaign
              
            )}
          
        
      )}

      
        
          {!isNew && (
             setShowDeleteDialog(true)}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-campaign"
            >
              
              {deleteMutation.isPending ? "Deleting..." : "Delete Campaign"}
            
          )}
        
        
           navigate("/verification/campaigns")}
            data-testid="button-cancel"
          >
            Cancel
          
          
            
            {updateMutation.isPending ? "Saving..." : "Save Campaign"}
          
        
      

      
        
          
            Delete Campaign
            
              Are you sure you want to delete this verification campaign? This action cannot be undone and will remove all associated data.
            
          
          
            Cancel
            
              Delete
            
          
        
      

      {!isNew && (
        
          
        
      )}
    
  );
}