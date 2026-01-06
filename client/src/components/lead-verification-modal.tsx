import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ExternalLink, CheckCircle2, AlertCircle, Upload, Linkedin, Phone, Mail, Loader2, ChevronDown, ChevronUp, Target, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type VerificationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onVerificationComplete: () => void;
  leadId: string;
  contactName: string;
  companyName: string;
  jobTitle?: string | null;
  agentId: string;
  campaignId?: string;
  contactId?: string;
};

type VerificationPath = 'linkedin' | 'oncall' | null;

export function LeadVerificationModal({
  isOpen,
  onClose,
  onVerificationComplete,
  leadId,
  contactName,
  companyName,
  jobTitle,
  agentId,
  campaignId,
  contactId,
}: VerificationModalProps) {
  const { toast } = useToast();
  const [selectedPath, setSelectedPath] = useState<VerificationPath>(null);
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [emailValidationResult, setEmailValidationResult] = useState<any>(null);
  const [showQAParameters, setShowQAParameters] = useState(false);

  // Fetch campaign details to show QA parameters
  const { data: campaignDetails } = useQuery<{
    id: string;
    name: string;
    qaParameters?: {
      min_score?: number;
      scoring_weights?: Record<string, number>;
      client_criteria?: {
        job_titles?: string[];
        seniority_levels?: string[];
        industries?: string[];
      };
      qualification_questions?: Array<{
        question: string;
        required: boolean;
        acceptable_responses: string[];
      }>;
    };
    customQaRules?: string;
    customQaFields?: Array<{
      name: string;
      label: string;
      type: string;
      required: boolean;
      options?: string[];
    }>;
  }>({
    queryKey: campaignId ? [`/api/campaigns/${campaignId}`] : [],
    enabled: !!campaignId && isOpen,
  });
  
  // On-Call path state
  const [newContactFirstName, setNewContactFirstName] = useState('');
  const [newContactLastName, setNewContactLastName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactJobTitle, setNewContactJobTitle] = useState('');
  const [callNotes, setCallNotes] = useState('');

  // Quick LinkedIn Lookup handler
  const handleQuickLinkedInLookup = async () => {
    if (!contactName || !companyName) {
      toast({
        title: "Missing Information",
        description: "Contact name and company are required for LinkedIn lookup.",
        variant: "destructive",
      });
      return;
    }

    // Build Google search query
    const query = `"${contactName}" "${companyName}" LinkedIn`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    
    // Open in new tab
    window.open(url, '_blank', 'noopener,noreferrer');

    // Log the lookup action
    try {
      await apiRequest('POST', '/api/activity-log', {
        entityType: 'lead',
        entityId: leadId,
        eventType: 'quick_linkedin_lookup',
        payload: {
          query_terms: query,
          contact_name: contactName,
          company_name: companyName,
        },
      });
    } catch (error) {
      console.error('Failed to log LinkedIn lookup:', error);
    }

    toast({
      title: "LinkedIn Search Opened",
      description: "Google search opened in new tab",
    });
  };

  // LinkedIn URL validation - strict hostname checking
  const isValidLinkedInUrl = (url: string): boolean => {
    if (!url) return false;
    try {
      const urlObj = new URL(url);
      const allowedHostnames = ['linkedin.com', 'www.linkedin.com', 'linkedin.cn', 'www.linkedin.cn'];
      return allowedHostnames.includes(urlObj.hostname.toLowerCase());
    } catch {
      return false;
    }
  };

  // LinkedIn verification mutation
  const linkedinVerificationMutation = useMutation({
    mutationFn: async () => {
      if (!linkedinUrl || !isValidLinkedInUrl(linkedinUrl)) {
        throw new Error("Valid LinkedIn URL required");
      }

      try {
        // Try to update existing lead first
        const response = await apiRequest('POST', '/api/linkedin-verification/verify-url', {
          leadId,
          linkedinUrl,
          agentId,
        });

        const data = await response.json();

        if (!data.ok) {
          throw new Error(data.error || 'Failed to save LinkedIn URL');
        }

        return data;
      } catch (error: any) {
        // If lead not found (404), create a new lead
        if (error?.message?.includes('Lead not found') || error?.status === 404) {
          if (!campaignId) {
            throw new Error("Campaign ID required to create lead");
          }
          const response = await apiRequest('POST', '/api/linkedin-verification/create-lead', {
            linkedinUrl,
            campaignId,
            contactId: contactId || leadId,
          });

          const data = await response.json();

          if (!data.ok) {
            throw new Error(data.error || 'Failed to create lead');
          }

          return data;
        }
        throw error;
      }
    },
    onSuccess: (data) => {
      toast({
        title: "LinkedIn URL Saved",
        description: "LinkedIn profile URL has been recorded successfully.",
      });
      
      // Invalidate queries to refresh lead data
      queryClient.invalidateQueries({ queryKey: ['/api/leads', leadId] });
      
      // Call verification complete callback to save disposition
      onVerificationComplete();
      
      // Close modal
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // On-Call verification mutation
  const oncallVerificationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/leads/${leadId}/verify-oncall`, {
        agentId,
        newContactFirstName,
        newContactLastName,
        newContactEmail,
        newContactPhone,
        newContactJobTitle,
        callNotes,
        linkedinUrl: linkedinUrl || null,
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "On-Call Verification Complete",
        description: "New contact created and verification recorded.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leads', leadId] });
      
      // Call verification complete callback to save disposition
      onVerificationComplete();
      
      // Close modal
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Email validation mutation using Kickbox 3-layer system
  const emailValidationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/leads/${leadId}/validate-email`, {});
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Email validation failed');
      }
      
      return data;
    },
    onSuccess: (data) => {
      setEmailValidationResult(data.validation);
      
      const statusLabels: Record<string, string> = {
        valid: 'Valid',
        acceptable: 'Acceptable',
        unknown: 'Unknown',
        invalid: 'Invalid',
      };
      
      toast({
        title: "Email Validated",
        description: `Email status: ${statusLabels[data.validation.status] || data.validation.status}`,
        variant: data.validation.status === 'invalid' ? 'destructive' : 'default',
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/leads', leadId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Email Validation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isLinkedInLookupDisabled = !contactName || !companyName;

  // Helper function to get status badge variant
  const getEmailStatusBadge = (status: string) => {
    switch (status) {
      case 'valid':
        return <Badge className="bg-green-500 text-white">Valid</Badge>;
      case 'acceptable':
        return <Badge className="bg-blue-500 text-white">Acceptable</Badge>;
      case 'unknown':
        return <Badge className="bg-yellow-500 text-white">Unknown</Badge>;
      case 'invalid':
        return <Badge variant="destructive">Invalid</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle>Qualified Lead Verification</DialogTitle>
              <DialogDescription>
                Verify the lead identity before approval
              </DialogDescription>
            </div>
            
            {/* Quick LinkedIn Lookup - Header */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleQuickLinkedInLookup}
              disabled={isLinkedInLookupDisabled}
              title={isLinkedInLookupDisabled ? "Enter Contact Name and Company to use Quick LinkedIn Lookup" : `Search Google for "${contactName}" "${companyName}" LinkedIn`}
              data-testid="button-quick-linkedin-lookup-header"
            >
              <Linkedin className="h-4 w-4 mr-2" />
              Quick LinkedIn Lookup
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>
          </div>
        </DialogHeader>

        {/* Lead Information */}
        <div className="bg-muted p-4 rounded-md space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Contact:</span>
            <span className="text-sm">{contactName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Company:</span>
            <span className="text-sm">{companyName}</span>
          </div>
          {jobTitle && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Title:</span>
              <span className="text-sm">{jobTitle}</span>
            </div>
          )}
        </div>

        {/* Email Validation Section */}
        <div className="bg-muted/50 p-4 rounded-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <span className="text-sm font-medium">Email Validation (Kickbox)</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => emailValidationMutation.mutate()}
              disabled={emailValidationMutation.isPending}
              data-testid="button-validate-email"
            >
              {emailValidationMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Validate Email
                </>
              )}
            </Button>
          </div>
          
          {emailValidationResult && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Status:</span>
                {getEmailStatusBadge(emailValidationResult.status)}
              </div>
              {emailValidationResult.kickboxScore !== undefined && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Kickbox Score:</span>
                  <span className="text-sm font-medium">{emailValidationResult.kickboxScore}</span>
                </div>
              )}
              {emailValidationResult.riskLevel && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Risk Level:</span>
                  <Badge variant="secondary">{emailValidationResult.riskLevel}</Badge>
                </div>
              )}
              {emailValidationResult.emailEligible !== undefined && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Eligible:</span>
                  <Badge className={emailValidationResult.emailEligible ? "bg-green-500 text-white" : "bg-red-500 text-white"}>
                    {emailValidationResult.emailEligible ? 'Yes' : 'No'}
                  </Badge>
                </div>
              )}
              {emailValidationResult.eligibilityReason && (
                <div className="text-xs text-muted-foreground">
                  Reason: {emailValidationResult.eligibilityReason}
                </div>
              )}
            </div>
          )}
        </div>

        {isLinkedInLookupDisabled && (
          <div className="text-sm text-muted-foreground bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md">
            <AlertCircle className="h-4 w-4 inline mr-2" />
            Enter Contact Name and Company to use Quick LinkedIn Lookup.
          </div>
        )}

        {/* Campaign QA Parameters - Collapsible */}
        {campaignDetails && (campaignDetails.qaParameters || campaignDetails.customQaRules) && (
          <Collapsible open={showQAParameters} onOpenChange={setShowQAParameters}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-3 h-auto" data-testid="button-toggle-qa-parameters">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="font-medium">Campaign QA Parameters</span>
                  <Badge variant="secondary" className="text-xs">{campaignDetails.name}</Badge>
                </div>
                {showQAParameters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="bg-muted/30 p-4 rounded-md space-y-4 mt-2">
                {/* Min Score */}
                {campaignDetails.qaParameters?.min_score && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Min Score:</span>
                    <Badge variant="outline">{campaignDetails.qaParameters.min_score}%</Badge>
                  </div>
                )}

                {/* Client Criteria */}
                {campaignDetails.qaParameters?.client_criteria && (
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Target Criteria:</span>
                    <div className="grid grid-cols-1 gap-2 pl-2">
                      {(campaignDetails.qaParameters.client_criteria.job_titles || []).length > 0 && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Job Titles: </span>
                          <span className="flex flex-wrap gap-1 mt-1">
                            {campaignDetails.qaParameters.client_criteria.job_titles?.map((title, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{title}</Badge>
                            ))}
                          </span>
                        </div>
                      )}
                      {(campaignDetails.qaParameters.client_criteria.seniority_levels || []).length > 0 && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Seniority: </span>
                          <span className="flex flex-wrap gap-1 mt-1">
                            {campaignDetails.qaParameters.client_criteria.seniority_levels?.map((level, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{level}</Badge>
                            ))}
                          </span>
                        </div>
                      )}
                      {(campaignDetails.qaParameters.client_criteria.industries || []).length > 0 && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Industries: </span>
                          <span className="flex flex-wrap gap-1 mt-1">
                            {campaignDetails.qaParameters.client_criteria.industries?.map((industry, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{industry}</Badge>
                            ))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Custom QA Rules */}
                {campaignDetails.customQaRules && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">AI Qualification Rules:</span>
                    </div>
                    <div className="bg-background p-3 rounded-md text-xs font-mono whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                      {campaignDetails.customQaRules}
                    </div>
                  </div>
                )}

                {/* Custom QA Fields */}
                {campaignDetails.customQaFields && campaignDetails.customQaFields.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Custom Fields to Extract:</span>
                    <div className="flex flex-wrap gap-2">
                      {campaignDetails.customQaFields.map((field, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {field.label} ({field.type}){field.required && ' *'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <Separator />

        {/* Path Selection */}
        {!selectedPath && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="hover-elevate cursor-pointer" onClick={() => setSelectedPath('linkedin')} data-testid="card-linkedin-verification-path">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Yes – Lead is Present
                </CardTitle>
                <CardDescription>
                  Contact is on LinkedIn and matches the profile
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Provide the LinkedIn profile URL to verify their identity
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate cursor-pointer" onClick={() => setSelectedPath('oncall')} data-testid="card-oncall-verification-path">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-blue-600" />
                  On-Call Confirmation
                </CardTitle>
                <CardDescription>
                  Spoke with a different person who confirmed information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Create new contact record and link to this lead
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* LinkedIn Verification Path */}
        {selectedPath === 'linkedin' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                LinkedIn Profile Verification
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedPath(null)}
                data-testid="button-back-to-path-selection"
              >
                Back
              </Button>
            </div>

            {/* Quick LinkedIn Lookup - Inline */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleQuickLinkedInLookup}
              disabled={isLinkedInLookupDisabled}
              className="w-full"
              data-testid="button-quick-linkedin-lookup-inline-linkedin"
            >
              <Linkedin className="h-4 w-4 mr-2" />
              Quick LinkedIn Lookup
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>

            <div className="space-y-3">
              <Label htmlFor="linkedinUrl">LinkedIn Profile URL *</Label>
              <Input
                id="linkedinUrl"
                type="url"
                placeholder="https://www.linkedin.com/in/example"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                data-testid="input-linkedin-url"
              />
              <p className="text-sm text-muted-foreground">
                Paste the LinkedIn profile URL to verify this lead's identity
              </p>
            </div>

            <Button
              onClick={() => linkedinVerificationMutation.mutate()}
              disabled={!linkedinUrl || !isValidLinkedInUrl(linkedinUrl) || linkedinVerificationMutation.isPending}
              className="w-full"
              data-testid="button-submit-linkedin-verification"
            >
              {linkedinVerificationMutation.isPending ? 'Saving...' : 'Save LinkedIn Profile'}
            </Button>
          </div>
        )}

        {/* On-Call Verification Path */}
        {selectedPath === 'oncall' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Phone className="h-5 w-5 text-blue-600" />
                On-Call Confirmation
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedPath(null)}
                data-testid="button-back-to-path-selection-oncall"
              >
                Back
              </Button>
            </div>

            {/* Quick LinkedIn Lookup - Inline */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleQuickLinkedInLookup}
              disabled={isLinkedInLookupDisabled}
              className="w-full"
              data-testid="button-quick-linkedin-lookup-inline-oncall"
            >
              <Linkedin className="h-4 w-4 mr-2" />
              Quick LinkedIn Lookup
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>

            <div className="space-y-3">
              <Label htmlFor="linkedinUrlOncall">LinkedIn Profile URL (Optional)</Label>
              <Input
                id="linkedinUrlOncall"
                type="url"
                placeholder="https://www.linkedin.com/in/example"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                data-testid="input-linkedin-url-oncall"
              />
              <p className="text-sm text-muted-foreground">
                Paste the LinkedIn profile URL of the person you spoke with
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={newContactFirstName}
                  onChange={(e) => setNewContactFirstName(e.target.value)}
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={newContactLastName}
                  onChange={(e) => setNewContactLastName(e.target.value)}
                  data-testid="input-last-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
                data-testid="input-phone"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job Title</Label>
              <Input
                id="jobTitle"
                value={newContactJobTitle}
                onChange={(e) => setNewContactJobTitle(e.target.value)}
                data-testid="input-job-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="callNotes">Call Notes</Label>
              <Textarea
                id="callNotes"
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                rows={3}
                data-testid="textarea-call-notes"
              />
            </div>

            <Button
              onClick={() => oncallVerificationMutation.mutate()}
              disabled={!newContactFirstName || !newContactLastName || !newContactEmail || oncallVerificationMutation.isPending}
              className="w-full"
              data-testid="button-submit-oncall-verification"
            >
              {oncallVerificationMutation.isPending ? 'Creating Contact...' : 'Create Contact & Verify'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
