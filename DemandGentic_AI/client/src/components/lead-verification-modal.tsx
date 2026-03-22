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
  const [selectedPath, setSelectedPath] = useState(null);
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [emailValidationResult, setEmailValidationResult] = useState(null);
  const [showQAParameters, setShowQAParameters] = useState(false);

  // Fetch campaign details to show QA parameters
  const { data: campaignDetails } = useQuery;
      client_criteria?: {
        job_titles?: string[];
        seniority_levels?: string[];
        industries?: string[];
      };
      qualification_questions?: Array;
    };
    customQaRules?: string;
    customQaFields?: Array;
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
      
      const statusLabels: Record = {
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
        return Valid;
      case 'acceptable':
        return Acceptable;
      case 'unknown':
        return Unknown;
      case 'invalid':
        return Invalid;
      default:
        return {status};
    }
  };

  return (
    
      
        
          
            
              Qualified Lead Verification
              
                Verify the lead identity before approval
              
            
            
            {/* Quick LinkedIn Lookup - Header */}
            
              
              Quick LinkedIn Lookup
              
            
          
        

        {/* Lead Information */}
        
          
            Contact:
            {contactName}
          
          
            Company:
            {companyName}
          
          {jobTitle && (
            
              Title:
              {jobTitle}
            
          )}
        

        {/* Email Validation Section */}
        
          
            
              
              Email Validation (Kickbox)
            
             emailValidationMutation.mutate()}
              disabled={emailValidationMutation.isPending}
              data-testid="button-validate-email"
            >
              {emailValidationMutation.isPending ? (
                <>
                  
                  Validating...
                
              ) : (
                <>
                  
                  Validate Email
                
              )}
            
          
          
          {emailValidationResult && (
            
              
                Status:
                {getEmailStatusBadge(emailValidationResult.status)}
              
              {emailValidationResult.kickboxScore !== undefined && (
                
                  Kickbox Score:
                  {emailValidationResult.kickboxScore}
                
              )}
              {emailValidationResult.riskLevel && (
                
                  Risk Level:
                  {emailValidationResult.riskLevel}
                
              )}
              {emailValidationResult.emailEligible !== undefined && (
                
                  Eligible:
                  
                    {emailValidationResult.emailEligible ? 'Yes' : 'No'}
                  
                
              )}
              {emailValidationResult.eligibilityReason && (
                
                  Reason: {emailValidationResult.eligibilityReason}
                
              )}
            
          )}
        

        {isLinkedInLookupDisabled && (
          
            
            Enter Contact Name and Company to use Quick LinkedIn Lookup.
          
        )}

        {/* Campaign QA Parameters - Collapsible */}
        {campaignDetails && (campaignDetails.qaParameters || campaignDetails.customQaRules) && (
          
            
              
                
                  
                  Campaign QA Parameters
                  {campaignDetails.name}
                
                {showQAParameters ?  : }
              
            
            
              
                {/* Min Score */}
                {campaignDetails.qaParameters?.min_score && (
                  
                    Min Score:
                    {campaignDetails.qaParameters.min_score}%
                  
                )}

                {/* Client Criteria */}
                {campaignDetails.qaParameters?.client_criteria && (
                  
                    Target Criteria:
                    
                      {(campaignDetails.qaParameters.client_criteria.job_titles || []).length > 0 && (
                        
                          Job Titles: 
                          
                            {campaignDetails.qaParameters.client_criteria.job_titles?.map((title, i) => (
                              {title}
                            ))}
                          
                        
                      )}
                      {(campaignDetails.qaParameters.client_criteria.seniority_levels || []).length > 0 && (
                        
                          Seniority: 
                          
                            {campaignDetails.qaParameters.client_criteria.seniority_levels?.map((level, i) => (
                              {level}
                            ))}
                          
                        
                      )}
                      {(campaignDetails.qaParameters.client_criteria.industries || []).length > 0 && (
                        
                          Industries: 
                          
                            {campaignDetails.qaParameters.client_criteria.industries?.map((industry, i) => (
                              {industry}
                            ))}
                          
                        
                      )}
                    
                  
                )}

                {/* Custom QA Rules */}
                {campaignDetails.customQaRules && (
                  
                    
                      
                      AI Qualification Rules:
                    
                    
                      {campaignDetails.customQaRules}
                    
                  
                )}

                {/* Custom QA Fields */}
                {campaignDetails.customQaFields && campaignDetails.customQaFields.length > 0 && (
                  
                    Custom Fields to Extract:
                    
                      {campaignDetails.customQaFields.map((field, i) => (
                        
                          {field.label} ({field.type}){field.required && ' *'}
                        
                      ))}
                    
                  
                )}
              
            
          
        )}

        

        {/* Path Selection */}
        {!selectedPath && (
          
             setSelectedPath('linkedin')} data-testid="card-linkedin-verification-path">
              
                
                  
                  Yes – Lead is Present
                
                
                  Contact is on LinkedIn and matches the profile
                
              
              
                
                  Provide the LinkedIn profile URL to verify their identity
                
              
            

             setSelectedPath('oncall')} data-testid="card-oncall-verification-path">
              
                
                  
                  On-Call Confirmation
                
                
                  Spoke with a different person who confirmed information
                
              
              
                
                  Create new contact record and link to this lead
                
              
            
          
        )}

        {/* LinkedIn Verification Path */}
        {selectedPath === 'linkedin' && (
          
            
              
                
                LinkedIn Profile Verification
              
               setSelectedPath(null)}
                data-testid="button-back-to-path-selection"
              >
                Back
              
            

            {/* Quick LinkedIn Lookup - Inline */}
            
              
              Quick LinkedIn Lookup
              
            

            
              LinkedIn Profile URL *
               setLinkedinUrl(e.target.value)}
                data-testid="input-linkedin-url"
              />
              
                Paste the LinkedIn profile URL to verify this lead's identity
              
            

             linkedinVerificationMutation.mutate()}
              disabled={!linkedinUrl || !isValidLinkedInUrl(linkedinUrl) || linkedinVerificationMutation.isPending}
              className="w-full"
              data-testid="button-submit-linkedin-verification"
            >
              {linkedinVerificationMutation.isPending ? 'Saving...' : 'Save LinkedIn Profile'}
            
          
        )}

        {/* On-Call Verification Path */}
        {selectedPath === 'oncall' && (
          
            
              
                
                On-Call Confirmation
              
               setSelectedPath(null)}
                data-testid="button-back-to-path-selection-oncall"
              >
                Back
              
            

            {/* Quick LinkedIn Lookup - Inline */}
            
              
              Quick LinkedIn Lookup
              
            

            
              LinkedIn Profile URL (Optional)
               setLinkedinUrl(e.target.value)}
                data-testid="input-linkedin-url-oncall"
              />
              
                Paste the LinkedIn profile URL of the person you spoke with
              
            

            
              
                First Name *
                 setNewContactFirstName(e.target.value)}
                  data-testid="input-first-name"
                />
              
              
                Last Name *
                 setNewContactLastName(e.target.value)}
                  data-testid="input-last-name"
                />
              
            

            
              Email *
               setNewContactEmail(e.target.value)}
                data-testid="input-email"
              />
            

            
              Phone
               setNewContactPhone(e.target.value)}
                data-testid="input-phone"
              />
            

            
              Job Title
               setNewContactJobTitle(e.target.value)}
                data-testid="input-job-title"
              />
            

            
              Call Notes
               setCallNotes(e.target.value)}
                rows={3}
                data-testid="textarea-call-notes"
              />
            

             oncallVerificationMutation.mutate()}
              disabled={!newContactFirstName || !newContactLastName || !newContactEmail || oncallVerificationMutation.isPending}
              className="w-full"
              data-testid="button-submit-oncall-verification"
            >
              {oncallVerificationMutation.isPending ? 'Creating Contact...' : 'Create Contact & Verify'}
            
          
        )}
      
    
  );
}