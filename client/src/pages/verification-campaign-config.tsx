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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [suppressionFile, setSuppressionFile] = useState<File | null>(null);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    return <div className="p-6" data-testid="text-loading">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/verification/campaigns")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            {isNew ? "New Verification Campaign" : `Configure: ${(campaign as any)?.name}`}
          </h1>
          <p className="text-muted-foreground mt-1" data-testid="text-page-description">
            Set up eligibility rules and account caps
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
          <CardDescription>Basic campaign information and targets</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Campaign Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., CAT62542 or Q1-2025-Enterprise"
              data-testid="input-campaign-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="monthlyTarget">Monthly Target</Label>
              <Input
                id="monthlyTarget"
                type="number"
                value={formData.monthlyTarget}
                onChange={(e) => setFormData({ ...formData, monthlyTarget: Number(e.target.value) })}
                data-testid="input-monthly-target"
              />
            </div>
            <div>
              <Label htmlFor="leadCapPerAccount">Lead Cap per Account</Label>
              <Input
                id="leadCapPerAccount"
                type="number"
                value={formData.leadCapPerAccount}
                onChange={(e) => setFormData({ ...formData, leadCapPerAccount: Number(e.target.value) })}
                data-testid="input-lead-cap"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eligibility Rules</CardTitle>
          <CardDescription>Define which contacts are eligible for this campaign (all fields optional)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Geography Selection */}
          <div>
            <Label>Allowed Geographies (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between mt-1.5"
                  data-testid="button-geo-select"
                >
                  <span className="truncate">
                    {formData.geoAllow.length === 0
                      ? "Select countries..."
                      : `${formData.geoAllow.length} countries selected`}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <div className="p-2 border-b">
                  <Input
                    placeholder="Search countries..."
                    className="h-8"
                    data-testid="input-geo-search"
                    onChange={(e) => {
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
                </div>
                <ScrollArea className="h-[300px]">
                  <div className="p-2 space-y-1">
                    {COMMON_COUNTRIES.map((country) => (
                      <div
                        key={country}
                        data-country={country}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover-elevate cursor-pointer"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            geoAllow: prev.geoAllow.includes(country)
                              ? prev.geoAllow.filter(c => c !== country)
                              : [...prev.geoAllow, country]
                          }));
                        }}
                        data-testid={`checkbox-geo-${country.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <Checkbox
                          checked={formData.geoAllow.includes(country)}
                          onCheckedChange={(checked) => {
                            setFormData(prev => ({
                              ...prev,
                              geoAllow: checked
                                ? [...prev.geoAllow, country]
                                : prev.geoAllow.filter(c => c !== country)
                            }));
                          }}
                        />
                        <span className="text-sm">{country}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                {formData.geoAllow.length > 0 && (
                  <div className="p-2 border-t flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      {formData.geoAllow.length} selected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormData(prev => ({ ...prev, geoAllow: [] }))}
                      data-testid="button-clear-geo"
                    >
                      Clear all
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            {formData.geoAllow.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {formData.geoAllow.map((country) => (
                  <Badge
                    key={country}
                    variant="secondary"
                    className="gap-1"
                    data-testid={`badge-geo-${country.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {country}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        geoAllow: prev.geoAllow.filter(c => c !== country)
                      }))}
                    />
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Leave empty to allow all geographies
            </p>
          </div>

          {/* Seniority Level Selection */}
          <div>
            <Label>Target Seniority Levels (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between mt-1.5"
                  data-testid="button-seniority-select"
                >
                  <span className="truncate">
                    {formData.seniorityLevels.length === 0
                      ? "Select seniority levels..."
                      : `${formData.seniorityLevels.length} levels selected`}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <div className="p-2 space-y-1">
                  {SENIORITY_LEVELS.map((level) => (
                    <div
                      key={level.value}
                      className="flex items-center gap-2 px-2 py-2 rounded hover-elevate cursor-pointer"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          seniorityLevels: prev.seniorityLevels.includes(level.value)
                            ? prev.seniorityLevels.filter(l => l !== level.value)
                            : [...prev.seniorityLevels, level.value]
                        }));
                      }}
                      data-testid={`checkbox-seniority-${level.value}`}
                    >
                      <Checkbox
                        checked={formData.seniorityLevels.includes(level.value)}
                        onCheckedChange={(checked) => {
                          setFormData(prev => ({
                            ...prev,
                            seniorityLevels: checked
                              ? [...prev.seniorityLevels, level.value]
                              : prev.seniorityLevels.filter(l => l !== level.value)
                          }));
                        }}
                      />
                      <span className="text-sm">{level.label}</span>
                    </div>
                  ))}
                </div>
                {formData.seniorityLevels.length > 0 && (
                  <div className="p-2 border-t flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      {formData.seniorityLevels.length} selected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormData(prev => ({ ...prev, seniorityLevels: [] }))}
                      data-testid="button-clear-seniority"
                    >
                      Clear all
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            {formData.seniorityLevels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {formData.seniorityLevels.map((level) => {
                  const levelInfo = SENIORITY_LEVELS.find(l => l.value === level);
                  return (
                    <Badge
                      key={level}
                      variant="secondary"
                      className="gap-1"
                      data-testid={`badge-seniority-${level}`}
                    >
                      {levelInfo?.label.split(' (')[0] || level}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          seniorityLevels: prev.seniorityLevels.filter(l => l !== level)
                        }))}
                      />
                    </Badge>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Filter contacts by seniority level extracted from job title. Leave empty to allow all levels.
            </p>
          </div>

          {/* Title Keywords with Match Mode */}
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="titleKeywords">Title Keywords (Optional - one per line)</Label>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Match Mode:</Label>
                <select
                  value={formData.titleMatchMode}
                  onChange={(e) => setFormData({ ...formData, titleMatchMode: e.target.value as any })}
                  className="text-xs border rounded px-2 py-1 bg-background"
                  data-testid="select-title-match-mode"
                >
                  <option value="contains">Contains</option>
                  <option value="word_boundary">Word Boundary</option>
                  <option value="exact">Exact Match</option>
                </select>
              </div>
            </div>
            <Textarea
              id="titleKeywords"
              rows={5}
              value={formData.titleKeywords}
              onChange={(e) => setFormData({ ...formData, titleKeywords: e.target.value })}
              placeholder="director&#10;manager&#10;vp"
              data-testid="input-title-keywords"
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {formData.titleMatchMode === "contains" && "Matches if title contains keyword anywhere (e.g., 'Sales Director' matches 'director')"}
              {formData.titleMatchMode === "word_boundary" && "Matches whole words only (e.g., 'Director' matches but 'Directors' does not)"}
              {formData.titleMatchMode === "exact" && "Requires exact title match (case-insensitive)"}
            </p>
          </div>

          {/* Industry Keywords */}
          <div>
            <Label htmlFor="industryKeywords">Industry Keywords (Optional - one per line)</Label>
            <Textarea
              id="industryKeywords"
              rows={4}
              value={formData.industryKeywords}
              onChange={(e) => setFormData({ ...formData, industryKeywords: e.target.value })}
              placeholder="technology&#10;software&#10;healthcare&#10;financial services"
              data-testid="input-industry-keywords"
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Filter contacts whose company industry or description matches these keywords. Leave empty to allow all industries.
            </p>
          </div>

          {/* Email-Name Match Requirement */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="requireEmailNameMatch">Require Email-Name Match</Label>
              <p className="text-xs text-muted-foreground">
                Flag contacts where the email address doesn't appear to match the contact's name
              </p>
            </div>
            <Switch
              id="requireEmailNameMatch"
              checked={formData.requireEmailNameMatch}
              onCheckedChange={(checked) => setFormData({ ...formData, requireEmailNameMatch: checked })}
              data-testid="switch-email-name-match"
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact Realness Checks Card */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Quality Filters</CardTitle>
          <CardDescription>
            Filter out low-quality or fake contacts that don't meet business standards
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Reject Fake Names */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="rejectFakeNames">Reject Fake Names</Label>
              <p className="text-xs text-muted-foreground">
                Exclude contacts with names that appear fake (e.g., company names used as person names, all-caps, numbers)
              </p>
            </div>
            <Switch
              id="rejectFakeNames"
              checked={formData.rejectFakeNames}
              onCheckedChange={(checked) => setFormData({ ...formData, rejectFakeNames: checked })}
              data-testid="switch-reject-fake-names"
            />
          </div>

          {/* Reject Self-Employed */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="rejectSelfEmployed">Reject Self-Employed</Label>
              <p className="text-xs text-muted-foreground">
                Exclude freelancers, consultants, contractors, and self-employed contacts
              </p>
            </div>
            <Switch
              id="rejectSelfEmployed"
              checked={formData.rejectSelfEmployed}
              onCheckedChange={(checked) => setFormData({ ...formData, rejectSelfEmployed: checked })}
              data-testid="switch-reject-self-employed"
            />
          </div>

          {/* Reject Missing Industry */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="rejectMissingIndustry">Reject Missing Industry</Label>
              <p className="text-xs text-muted-foreground">
                Exclude contacts whose company has no industry information
              </p>
            </div>
            <Switch
              id="rejectMissingIndustry"
              checked={formData.rejectMissingIndustry}
              onCheckedChange={(checked) => setFormData({ ...formData, rejectMissingIndustry: checked })}
              data-testid="switch-reject-missing-industry"
            />
          </div>

          {/* Reject Missing Company LinkedIn */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="rejectMissingCompanyLinkedIn">Reject Missing Company LinkedIn</Label>
              <p className="text-xs text-muted-foreground">
                Exclude contacts whose company has no LinkedIn page
              </p>
            </div>
            <Switch
              id="rejectMissingCompanyLinkedIn"
              checked={formData.rejectMissingCompanyLinkedIn}
              onCheckedChange={(checked) => setFormData({ ...formData, rejectMissingCompanyLinkedIn: checked })}
              data-testid="switch-reject-missing-linkedin"
            />
          </div>

          {/* Reject Freemail with Business Title */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="rejectFreemailWithTitle">Reject Personal Email + Business Title</Label>
              <p className="text-xs text-muted-foreground">
                Exclude contacts using personal email (Gmail, Yahoo) but claiming business titles (Director, VP, Manager)
              </p>
            </div>
            <Switch
              id="rejectFreemailWithTitle"
              checked={formData.rejectFreemailWithTitle}
              onCheckedChange={(checked) => setFormData({ ...formData, rejectFreemailWithTitle: checked })}
              data-testid="switch-reject-freemail-title"
            />
          </div>

          {/* Reject Missing Tenure */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="rejectMissingTenure">Reject Missing Tenure</Label>
              <p className="text-xs text-muted-foreground">
                Exclude contacts with no tenure data (unknown time in position or time in company)
              </p>
            </div>
            <Switch
              id="rejectMissingTenure"
              checked={formData.rejectMissingTenure}
              onCheckedChange={(checked) => setFormData({ ...formData, rejectMissingTenure: checked })}
              data-testid="switch-reject-missing-tenure"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quality Targets</CardTitle>
          <CardDescription>Set quality thresholds for this campaign</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="okRateTarget">OK Email Rate Target</Label>
              <Input
                id="okRateTarget"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formData.okRateTarget}
                onChange={(e) => setFormData({ ...formData, okRateTarget: Number(e.target.value) })}
                data-testid="input-ok-rate"
              />
              <p className="text-xs text-muted-foreground mt-1">Target: 0.95 (95%)</p>
            </div>
            <div>
              <Label htmlFor="deliverabilityTarget">Deliverability Target</Label>
              <Input
                id="deliverabilityTarget"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formData.deliverabilityTarget}
                onChange={(e) => setFormData({ ...formData, deliverabilityTarget: Number(e.target.value) })}
                data-testid="input-deliverability"
              />
              <p className="text-xs text-muted-foreground mt-1">Target: 0.97 (97%)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isNew && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldX className="h-5 w-5" />
                  Suppression List
                </CardTitle>
                <CardDescription>
                  Upload a CSV file to exclude specific contacts from this campaign
                </CardDescription>
              </div>
              <Badge variant="secondary" data-testid="text-suppression-count">
                {suppressionList ? (suppressionList as any[]).length : 0} entries
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload Section */}
            <div className="border rounded-lg p-4 bg-muted/50">
              <div className="space-y-3">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <Label htmlFor="suppression-file">Upload CSV File</Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      Supports: Email, CAV ID, CAV User ID, or Full Name + Company Name
                    </p>
                    <Input
                      ref={fileInputRef}
                      id="suppression-file"
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      data-testid="input-suppression-file"
                    />
                    {suppressionFile && (
                      <div className="flex items-center gap-2 mt-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm" data-testid="text-selected-file">
                          {suppressionFile.name}
                        </span>
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={handleUploadSuppression}
                    disabled={!suppressionFile || uploadSuppressionMutation.isPending}
                    data-testid="button-upload-suppression"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadSuppressionMutation.isPending ? "Uploading..." : "Upload"}
                  </Button>
                </div>
                
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">CSV Format Requirements:</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-2">
                    <li>Headers: email, cavId, cavUserId, firstName, lastName, companyName</li>
                    <li>Each row must have: email OR cavId OR cavUserId OR (firstName + companyName)</li>
                    <li>Supports comma, tab, pipe, or semicolon delimiters (auto-detected)</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Current Entries */}
            {suppressionLoading ? (
              <div className="text-sm text-muted-foreground" data-testid="text-suppression-loading">
                Loading suppression list...
              </div>
            ) : suppressionList && (suppressionList as any[]).length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 border-b">
                  <h4 className="text-sm font-medium">Current Suppression Entries</h4>
                </div>
                <div className="max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Identifier</TableHead>
                        <TableHead>Added</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(suppressionList as any[]).slice(0, 100).map((entry: any) => (
                        <TableRow key={entry.id} data-testid={`row-suppression-${entry.id}`}>
                          <TableCell>
                            {entry.emailLower && <Badge variant="outline">Email</Badge>}
                            {entry.cavId && <Badge variant="outline">CAV ID</Badge>}
                            {entry.cavUserId && <Badge variant="outline">User ID</Badge>}
                            {entry.nameCompanyHash && <Badge variant="outline">Name+Company</Badge>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {entry.emailLower || entry.cavId || entry.cavUserId || entry.nameCompanyHash?.substring(0, 16) + '...'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(entry.addedAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {(suppressionList as any[]).length > 100 && (
                  <div className="bg-muted/50 px-4 py-2 border-t text-xs text-muted-foreground">
                    Showing first 100 of {(suppressionList as any[]).length} entries
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ShieldX className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm" data-testid="text-no-suppressions">No suppression entries yet</p>
                <p className="text-xs mt-1">Upload a CSV file to exclude contacts from this campaign</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between gap-2 mt-6">
        <div>
          {!isNew && (
            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-campaign"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleteMutation.isPending ? "Deleting..." : "Delete Campaign"}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/verification/campaigns")}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            data-testid="button-save"
          >
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save Campaign"}
          </Button>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this verification campaign? This action cannot be undone and will remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {!isNew && (
        <div className="mt-8">
          <AccountCapManager campaignId={id!} />
        </div>
      )}
    </div>
  );
}
