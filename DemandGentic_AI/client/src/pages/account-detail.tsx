import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Building2, 
  UserPlus, 
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Globe,
  Users,
  DollarSign,
  MapPin,
  Sparkles,
  CheckCircle2,
  XCircle,
  Tag,
  Activity,
  FileText,
  Briefcase,
  TrendingUp,
  Shield,
  List,
  Phone,
  Target
} from "lucide-react";
import type { Account, Contact, PipelineOpportunity } from "@shared/schema";
import { HeaderActionBar } from "@/components/shared/header-action-bar";
import { SectionCard } from "@/components/shared/section-card";
import { ListSegmentMembership } from "@/components/list-segment-membership";
import { ActivityLogTimeline } from "@/components/activity-log-timeline";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { AccountInsights } from "@/components/AccountInsights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // Import Card components
import type { FilterGroup } from "@/types/filters"; // Assuming FilterGroup type is here
import { ACCOUNT_FIELD_LABELS, ACCOUNT_ADDRESS_LABELS } from "@shared/field-labels";

export default function AccountDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: accounts = [] } = useQuery({
    queryKey: ['/api/accounts'],
  });

  const currentIndex = accounts.findIndex(a => a.id === id);
  const prevAccount = currentIndex > 0 ? accounts[currentIndex - 1] : null;
  const nextAccount = currentIndex (null);
  const [selectedSecondary, setSelectedSecondary] = useState([]);
  const [selectedReject, setSelectedReject] = useState([]);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    domain: "",
    industryStandardized: "",
    employeesSizeRange: "",
    annualRevenue: "",
    minAnnualRevenue: "",
    maxAnnualRevenue: "",
    minEmployeesSize: "",
    maxEmployeesSize: "",
    hqCity: "",
    hqState: "",
    hqCountry: "",
    mainPhone: "",
    mainPhoneE164: "", // Added for E.164 formatted phone number
    linkedinUrl: "",
    description: "",
    list: "",
    yearFounded: "",
    customFields: "", // JSON string for custom fields
  });

  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: [`/api/accounts/${id}`],
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: [`/api/accounts/${id}/contacts`],
    enabled: !!id,
  });

  const { data: opportunities = [], isLoading: opportunitiesLoading } = useQuery>({
    queryKey: [`/api/accounts/${id}/opportunities`],
    enabled: !!id,
  });

  const reviewAIMutation = useMutation({
    mutationFn: async (reviewData: { accept_primary?: string; add_secondary?: string[]; reject?: string[] }) => {
      const response = await apiRequest('POST', `/api/accounts/${id}/industry/ai-review`, reviewData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${id}`] });
      setSelectedPrimary(null);
      setSelectedSecondary([]);
      setSelectedReject([]);
      toast({
        title: "Success",
        description: "AI suggestions reviewed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('PATCH', `/api/accounts/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${id}`] });
      setEditDialogOpen(false);
      toast({
        title: "Success",
        description: "Account updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const handleEditClick = () => {
    if (account) {
      setEditForm({
        name: account.name || "",
        domain: account.domain || "",
        industryStandardized: account.industryStandardized || "",
        employeesSizeRange: account.employeesSizeRange || "",
        annualRevenue: account.annualRevenue || "",
        minAnnualRevenue: account.minAnnualRevenue?.toString() || "",
        maxAnnualRevenue: account.maxAnnualRevenue?.toString() || "",
        minEmployeesSize: account.minEmployeesSize?.toString() || "",
        maxEmployeesSize: account.maxEmployeesSize?.toString() || "",
        hqCity: account.hqCity || "",
        hqState: account.hqState || "",
        hqCountry: account.hqCountry || "",
        mainPhone: account.mainPhone || "",
        mainPhoneE164: account.mainPhoneE164 || "", // Populate E.164 format
        linkedinUrl: account.linkedinUrl || "",
        description: account.description || "",
        list: account.list || "",
        yearFounded: account.yearFounded?.toString() || "",
        customFields: account.customFields ? JSON.stringify(account.customFields, null, 2) : "",
      });
      setEditDialogOpen(true);
    }
  };

  const handleSaveEdit = () => {
    const updateData: any = { ...editForm };
    if (editForm.yearFounded) {
      updateData.yearFounded = parseInt(editForm.yearFounded);
    }
    if (editForm.minEmployeesSize) {
      updateData.minEmployeesSize = parseInt(editForm.minEmployeesSize);
    }
    if (editForm.maxEmployeesSize) {
      updateData.maxEmployeesSize = parseInt(editForm.maxEmployeesSize);
    }
    if (editForm.minAnnualRevenue) {
      updateData.minAnnualRevenue = parseFloat(editForm.minAnnualRevenue);
    }
    if (editForm.maxAnnualRevenue) {
      updateData.maxAnnualRevenue = parseFloat(editForm.maxAnnualRevenue);
    }
    // Ensure mainPhone is updated if mainPhoneE164 is changed
    if (editForm.mainPhoneE164 && !editForm.mainPhone) {
        updateData.mainPhone = editForm.mainPhoneE164; // Or handle based on your normalization logic
    }
    // Parse custom fields JSON
    if (editForm.customFields && editForm.customFields.trim()) {
      try {
        updateData.customFields = JSON.parse(editForm.customFields);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Invalid Custom Fields",
          description: "Custom fields must be valid JSON format",
        });
        return;
      }
    } else {
      updateData.customFields = null;
    }
    updateAccountMutation.mutate(updateData);
  };

  if (accountLoading) {
    return (
      
        
          
        
        
          
          
        
      
    );
  }

  if (!account) {
    return (
      
        Account not found
         setLocation('/accounts')} className="mt-4">
          
          Back to Accounts
        
      
    );
  }

  const initials = account.name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const headerActions = [
    {
      type: "linkedin" as const,
      value: account.linkedinUrl || undefined,
      label: "View LinkedIn Profile",
    },
    {
      type: "website" as const,
      value: account.domain || undefined,
      label: "Visit Website",
    },
    {
      type: "call" as const,
      value: account.mainPhoneE164 ?? undefined, // Use E.164 for click-to-call
      label: "Call Main Number",
    },
    {
      type: "email" as const,
      value: account.domain ? `info@${account.domain}` : undefined,
      label: "Send Email",
    },
    {
      type: "copy" as const,
      value: account.domain || undefined,
      label: "Copy Domain",
    },
  ];

  const badges = [
    account.industryStandardized && {
      label: account.industryStandardized,
      variant: "default" as const,
    },
  ].filter(Boolean) as Array;
  const customFields = account.customFields as Record | null;
  const hasCustomFields = !!customFields && Object.keys(customFields).length > 0;

  return (
    
      {/* Header Action Bar */}
      
             prevAccount && setLocation(`/accounts/${prevAccount.id}`)}
              disabled={!prevAccount}
              data-testid="button-prev-account"
              className="h-9 w-9 rounded-lg border border-border/50 hover:border-border hover:bg-accent/50 disabled:opacity-30"
            >
              
            
             nextAccount && setLocation(`/accounts/${nextAccount.id}`)}
              disabled={!nextAccount}
              data-testid="button-next-account"
              className="h-9 w-9 rounded-lg border border-border/50 hover:border-border hover:bg-accent/50 disabled:opacity-30"
            >
              
            
            
             setLocation('/accounts')}
              data-testid="button-back-accounts"
              className="h-9 w-9 rounded-lg border border-border/50 hover:border-border hover:bg-accent/50"
            >
              
            
          
        }
      />

      {/* Main Content - Two Column Layout */}
      
        
          {/* Left Column - Primary Content (2/3) */}
          
            {/* Overview Section */}
            
                  Edit Details
                
              }
            >
              
                
                  {ACCOUNT_FIELD_LABELS.industryStandardized}
                  {account.industryStandardized || "-"}
                  {account.industrySecondary && account.industrySecondary.length > 0 && (
                    
                      {account.industrySecondary.map((ind, idx) => (
                        
                          {ind}
                        
                      ))}
                    
                  )}
                

                
                  {ACCOUNT_FIELD_LABELS.employeesSizeRange}
                  
                    
                    {account.employeesSizeRange || "-"}
                  
                

                {(account.minEmployeesSize || account.maxEmployeesSize) && (
                  
                    Employee Range
                    
                      {account.minEmployeesSize && account.maxEmployeesSize 
                        ? `${account.minEmployeesSize} - ${account.maxEmployeesSize}`
                        : account.minEmployeesSize 
                        ? `${account.minEmployeesSize}+`
                        : `Up to ${account.maxEmployeesSize}`}
                    
                  
                )}

                
                  {ACCOUNT_FIELD_LABELS.annualRevenue}
                  
                    
                    {account.annualRevenue || "-"}
                  
                

                {(account.minAnnualRevenue || account.maxAnnualRevenue) && (
                  
                    {ACCOUNT_FIELD_LABELS.revenueRange}
                    
                      {account.minAnnualRevenue && account.maxAnnualRevenue 
                        ? `$${account.minAnnualRevenue} - $${account.maxAnnualRevenue}`
                        : account.minAnnualRevenue 
                        ? `$${account.minAnnualRevenue}+`
                        : `Up to $${account.maxAnnualRevenue}`}
                    
                  
                )}

                
                  {ACCOUNT_ADDRESS_LABELS.hqCity}
                  
                    
                    {account.hqCity || "-"}
                  
                

                
                  {ACCOUNT_ADDRESS_LABELS.hqState}
                  {account.hqState || "-"}
                

                
                  {ACCOUNT_ADDRESS_LABELS.hqPostalCode}
                  {account.hqPostalCode || "-"}
                

                
                  {ACCOUNT_ADDRESS_LABELS.hqCountry}
                  {account.hqCountry || "-"}
                

                
                  {ACCOUNT_FIELD_LABELS.yearFounded}
                  {account.yearFounded || "-"}
                

                
                  {ACCOUNT_FIELD_LABELS.mainPhone}
                  {account.mainPhone || account.mainPhoneE164 ? (
                    
                      {account.mainPhoneE164 ? (
                        
                          
                          {account.mainPhone || account.mainPhoneE164}
                        
                      ) : (
                        
                          
                          {account.mainPhone}
                        
                      )}
                      {account.mainPhoneExtension && (
                        Ext: {account.mainPhoneExtension}
                      )}
                    
                  ) : (
                    -
                  )}
                

                
                  {ACCOUNT_ADDRESS_LABELS.hqStreet1}
                  {account.hqStreet1 || "-"}
                

                
                  {ACCOUNT_ADDRESS_LABELS.hqStreet2}
                  {account.hqStreet2 || "-"}
                

                
                  {ACCOUNT_ADDRESS_LABELS.hqStreet3}
                  {account.hqStreet3 || "-"}
                

                {account.list && (
                  
                    {ACCOUNT_FIELD_LABELS.list}
                    {account.list}
                  
                )}

                {account.description && (
                  
                    {ACCOUNT_FIELD_LABELS.description}
                    {account.description}
                  
                )}
              

              {/* Full Address String */}
              {account.companyLocation && (
                
                  {ACCOUNT_ADDRESS_LABELS.companyLocation}
                  {account.companyLocation}
                
              )}

              {/* Custom Fields */}
              {hasCustomFields && (
                
                  Custom Fields
                  
                    {Object.entries(customFields || {}).map(([key, value]) => (
                      
                        
                          {key.replace(/_/g, ' ')}
                        
                        
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        
                      
                    ))}
                  
                
              )}

              {account.techStack && account.techStack.length > 0 && (
                
                  Technologies Installed
                  
                    {account.techStack.map((tech, idx) => (
                      
                        {tech}
                      
                    ))}
                  
                
              )}

              {account.intentTopics && account.intentTopics.length > 0 && (
                
                  Intent Signals
                  
                    {account.intentTopics.map((topic, idx) => (
                      
                        {topic}
                      
                    ))}
                  
                
              )}
            

            {/* Related Contacts */}
            
                  
                  Add Contact
                
              }
            >
              {contactsLoading ? (
                
                  {[1, 2, 3].map(i => (
                    
                  ))}
                
              ) : contacts.length > 0 ? (
                
                  
                    
                      
                        Name
                        Title
                        Email
                        Direct Work Phone
                        Mobile Direct
                        Actions
                      
                    
                    
                      {contacts.map((contact) => {
                        const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                        const initials = `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.toUpperCase();
                        return (
                           setLocation(`/contacts/${contact.id}`)}
                            data-testid={`row-contact-${contact.id}`}
                          >
                            
                              
                                
                                  {initials}
                                
                                {fullName || "No name"}
                              
                            
                            {contact.jobTitle || "-"}
                            {contact.email}
                            
                              {contact.directPhoneE164 ? (
                                
                                  
                                  {contact.directPhone}
                                
                              ) : (
                                contact.directPhone || "-"
                              )}
                            
                            
                              {contact.mobilePhoneE164 ? (
                                
                                  
                                  {contact.mobilePhone}
                                
                              ) : (
                                contact.mobilePhone || "-"
                              )}
                            
                            
                               {
                                  e.stopPropagation();
                                  setLocation(`/contacts/${contact.id}`);
                                }}
                                data-testid={`button-view-contact-${contact.id}`}
                              >
                                View
                              
                            
                          
                        );
                      })}
                    
                  
                
              ) : (
                
                  
                  No contacts linked to this account
                  
                    
                    Add First Contact
                  
                
              )}
            

            {/* Related Deals */}
            
              {opportunitiesLoading ? (
                
                  {[1, 2, 3].map(i => (
                    
                  ))}
                
              ) : opportunities.length > 0 ? (
                
                  
                    
                      
                        Title
                        Pipeline
                        Stage
                        Value
                        Probability
                        Expected Close
                        Actions
                      
                    
                    
                      {opportunities.map((opp) => (
                         setLocation(`/pipeline/pivotal?pipeline=${opp.pipelineId}&deal=${opp.id}`)}
                          data-testid={`row-opportunity-${opp.id}`}
                        >
                          {opp.name}
                          {opp.pipelineName}
                          
                            {opp.stage}
                          
                          
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            }).format(Number(opp.amount) || 0)}
                          
                          {opp.probability ? `${opp.probability}%` : '-'}
                          
                            {opp.closeDate 
                              ? new Date(opp.closeDate).toLocaleDateString()
                              : '-'}
                          
                          
                             {
                                e.stopPropagation();
                                setLocation(`/pipeline/pivotal?pipeline=${opp.pipelineId}&deal=${opp.id}`);
                              }}
                              data-testid={`button-view-opportunity-${opp.id}`}
                            >
                              View
                            
                          
                        
                      ))}
                    
                  
                
              ) : (
                
                  
                  No deals linked to this account
                   setLocation('/pipeline/pivotal')}
                    data-testid="button-create-first-deal"
                  >
                    
                    Create First Deal
                  
                
              )}
            

            {/* Custom Fields */}
            {hasCustomFields && (
              
                
                  
                    
                      
                        Field Name
                        Value
                      
                    
                    
                      {Object.entries(customFields || {}).map(([key, value]) => (
                        
                          {key}
                          {String(value)}
                        
                      ))}
                    
                  
                
              
            )}

            {/* AI Enrichment Section */}
            {account.industryAiCandidates && Array.isArray(account.industryAiCandidates) && account.industryAiCandidates.length > 0 && (
              
                
                  {account.industryAiCandidates.map((candidate: any, idx: number) => {
                    const candidateName = candidate.name || candidate;
                    const score = candidate.score || 0;
                    const isPrimary = selectedPrimary === candidateName;
                    const isSecondary = selectedSecondary.includes(candidateName);
                    const isRejected = selectedReject.includes(candidateName);

                    return (
                      
                        
                          
                            {candidateName}
                            
                              {Math.round(score * 100)}% confidence
                            
                          
                          
                             {
                                setSelectedPrimary(isPrimary ? null : candidateName);
                                if (isSecondary) setSelectedSecondary(prev => prev.filter(s => s !== candidateName));
                                if (isRejected) setSelectedReject(prev => prev.filter(s => s !== candidateName));
                              }}
                              className={`text-sm flex items-center gap-1 ${isPrimary ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                              data-testid={`button-set-primary-${idx}`}
                            >
                              
                              Set as Primary
                            
                             {
                                if (isSecondary) {
                                  setSelectedSecondary(prev => prev.filter(s => s !== candidateName));
                                } else {
                                  setSelectedSecondary(prev => [...prev, candidateName]);
                                  if (isPrimary) setSelectedPrimary(null);
                                  if (isRejected) setSelectedReject(prev => prev.filter(s => s !== candidateName));
                                }
                              }}
                              className={`text-sm flex items-center gap-1 ${isSecondary ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                              data-testid={`button-add-secondary-${idx}`}
                            >
                              
                              {isSecondary ? 'Remove from' : 'Add to'} Secondary
                            
                             {
                                if (isRejected) {
                                  setSelectedReject(prev => prev.filter(s => s !== candidateName));
                                } else {
                                  setSelectedReject(prev => [...prev, candidateName]);
                                  if (isPrimary) setSelectedPrimary(null);
                                  if (isSecondary) setSelectedSecondary(prev => prev.filter(s => s !== candidateName));
                                }
                              }}
                              className={`text-sm flex items-center gap-1 ${isRejected ? 'text-destructive font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                              data-testid={`button-reject-${idx}`}
                            >
                              
                              {isRejected ? 'Undo' : 'Reject'}
                            
                          
                        
                      
                    );
                  })}
                

                
                   {
                      setSelectedPrimary(null);
                      setSelectedSecondary([]);
                      setSelectedReject([]);
                    }}
                    data-testid="button-clear-ai-review"
                  >
                    Clear Selection
                  
                   {
                      const reviewData: any = {};
                      if (selectedPrimary) reviewData.accept_primary = selectedPrimary;
                      if (selectedSecondary.length > 0) reviewData.add_secondary = selectedSecondary;
                      if (selectedReject.length > 0) reviewData.reject = selectedReject;

                      if (!selectedPrimary && selectedSecondary.length === 0 && selectedReject.length === 0) {
                        toast({
                          variant: "destructive",
                          title: "No Action Selected",
                          description: "Please select at least one action before submitting",
                        });
                        return;
                      }

                      reviewAIMutation.mutate(reviewData);
                    }}
                    disabled={reviewAIMutation.isPending}
                    data-testid="button-submit-ai-review"
                  >
                    Submit Review
                  
                
              
            )}

            {/* AI Account Insights */}
            

            {/* Lists & Segments */}
            
              
            

            {/* Activity Timeline */}
            
              
            

            {/* M365 Email Activity */}
            
              
            
          

          {/* Right Column - Contextual Actions & Info (1/3) */}
          
            {/* Account Summary */}
            
               {/* Adjusted grid for better spacing */}
                 {
                    // Navigate to contacts page with account name filter
                    const accountFilter: FilterGroup = {
                      logic: 'AND',
                      conditions: [{
                        id: `filter-${Date.now()}`,
                        field: 'accountName',
                        operator: 'equals',
                        values: [account.name]
                      }]
                    };
                    // Store filter in sessionStorage for contacts page to pick up
                    sessionStorage.setItem('contactsFilter', JSON.stringify(accountFilter));
                    setLocation('/contacts');
                  }}
                >
                  
                    Total Contacts
                  
                  
                    
                      {contacts?.length || 0}
                    
                    Click to view contacts
                  
                

                
                  Domain
                  {account.domain || "-"}
                
                {account.employeesSizeRange && (
                  
                    Size Range
                    {account.employeesSizeRange}
                  
                )}
              
            

            {/* Quick Actions */}
            
              
                
                  
                    
                      
                      Add to Campaign
                    
                  
                  
                     setLocation('/campaigns')}>
                      Email Campaign
                    
                     setLocation('/telemarketing')}>
                      Telemarketing Campaign
                    
                  
                
                 {
                    toast({
                      title: "Coming Soon",
                      description: "Add to List functionality will be available soon",
                    });
                  }}
                >
                  
                  Add to List
                
                 {
                    toast({
                      title: "Coming Soon",
                      description: "Notes functionality will be available soon",
                    });
                  }}
                >
                  
                  Create Note
                
              
            

            {/* Data Quality */}
            
              {(() => {
                // Calculate data completeness for this account
                const keyFields = [
                  'domain', 'industryStandardized', 'employeesSizeRange', 'annualRevenue',
                  'hqCity', 'hqState', 'hqPostalCode', 'hqCountry', 'hqStreet1',
                  'mainPhone', 'yearFounded', 'description', 'linkedinUrl',
                  'companyLocation', 'sicCode', 'naicsCode'
                ];
                
                const populatedFields = keyFields.filter(field => {
                  const value = (account as any)[field];
                  return value !== null && value !== undefined && value !== '';
                });
                
                const missingFields = keyFields.filter(field => {
                  const value = (account as any)[field];
                  return value === null || value === undefined || value === '';
                });
                
                const completeness = Math.round((populatedFields.length / keyFields.length) * 100);
                
                // Determine quality badge
                const getQualityBadge = (score: number) => {
                  if (score >= 80) return { label: 'Excellent', variant: 'default', className: 'bg-green-500/10 text-green-500 border-green-500/20' };
                  if (score >= 60) return { label: 'Good', variant: 'secondary', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
                  if (score >= 40) return { label: 'Fair', variant: 'secondary', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' };
                  return { label: 'Poor', variant: 'secondary', className: 'bg-red-500/10 text-red-500 border-red-500/20' };
                };
                
                const quality = getQualityBadge(completeness);
                
                // Field name mapping for display using centralized labels
                const fieldLabels: Record = {
                  domain: ACCOUNT_FIELD_LABELS.domain,
                  industryStandardized: ACCOUNT_FIELD_LABELS.industryStandardized,
                  employeesSizeRange: ACCOUNT_FIELD_LABELS.employeesSizeRange,
                  annualRevenue: ACCOUNT_FIELD_LABELS.annualRevenue,
                  hqCity: ACCOUNT_ADDRESS_LABELS.hqCity,
                  hqState: ACCOUNT_ADDRESS_LABELS.hqState,
                  hqPostalCode: ACCOUNT_ADDRESS_LABELS.hqPostalCode,
                  hqCountry: ACCOUNT_ADDRESS_LABELS.hqCountry,
                  hqStreet1: ACCOUNT_ADDRESS_LABELS.hqStreet1,
                  mainPhone: ACCOUNT_FIELD_LABELS.mainPhone,
                  yearFounded: ACCOUNT_FIELD_LABELS.yearFounded,
                  description: ACCOUNT_FIELD_LABELS.description,
                  linkedinUrl: ACCOUNT_FIELD_LABELS.linkedinUrl,
                  companyLocation: ACCOUNT_ADDRESS_LABELS.companyLocation,
                  sicCode: ACCOUNT_FIELD_LABELS.sicCode,
                  naicsCode: ACCOUNT_FIELD_LABELS.naicsCode
                };
                
                return (
                  
                    
                      Completeness Score
                      
                        {completeness}% - {quality.label}
                      
                    
                    
                    
                      
                        {populatedFields.length} of {keyFields.length} key fields
                      
                      
                        = 80 ? 'bg-green-500' :
                            completeness >= 60 ? 'bg-blue-500' :
                            completeness >= 40 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${completeness}%` }}
                        />
                      
                    
                    
                    {missingFields.length > 0 && (
                      
                        Missing Fields ({missingFields.length})
                        
                          {missingFields.slice(0, 8).map(field => (
                            
                              {fieldLabels[field] || field}
                            
                          ))}
                          {missingFields.length > 8 && (
                            
                              +{missingFields.length - 8} more
                            
                          )}
                        
                      
                    )}
                  
                );
              })()}
            
            
            {/* Compliance & Health */}
            
              
                
                  DNC Contacts
                  0
                
                
                  Unsubscribed
                  0
                
                
                  Bounce Risk
                  
                    Low
                  
                
              
            
          
        
      

      {/* Edit Account Dialog */}
      
        
          
            Edit Account Details
            Update account information below.
          
          
            
              
                {ACCOUNT_FIELD_LABELS.name} *
                 setEditForm({ ...editForm, name: e.target.value })}
                />
              
              
                {ACCOUNT_FIELD_LABELS.domain}
                 setEditForm({ ...editForm, domain: e.target.value })}
                />
              
            
            
              
                {ACCOUNT_FIELD_LABELS.industryStandardized}
                 setEditForm({ ...editForm, industryStandardized: e.target.value })}
                />
              
              
                {ACCOUNT_FIELD_LABELS.employeesSizeRange}
                 setEditForm({ ...editForm, employeesSizeRange: e.target.value })}
                />
              
            
            
              
                {ACCOUNT_FIELD_LABELS.minEmployeesSize}
                 setEditForm({ ...editForm, minEmployeesSize: e.target.value })}
                  placeholder="e.g., 100"
                />
              
              
                {ACCOUNT_FIELD_LABELS.maxEmployeesSize}
                 setEditForm({ ...editForm, maxEmployeesSize: e.target.value })}
                  placeholder="e.g., 500"
                />
              
            
            
              
                {ACCOUNT_FIELD_LABELS.annualRevenue}
                 setEditForm({ ...editForm, annualRevenue: e.target.value })}
                />
              
              
                {ACCOUNT_FIELD_LABELS.yearFounded}
                 setEditForm({ ...editForm, yearFounded: e.target.value })}
                />
              
            
            
              
                {ACCOUNT_FIELD_LABELS.minAnnualRevenue}
                 setEditForm({ ...editForm, minAnnualRevenue: e.target.value })}
                  placeholder="e.g., 1000000"
                />
              
              
                {ACCOUNT_FIELD_LABELS.maxAnnualRevenue}
                 setEditForm({ ...editForm, maxAnnualRevenue: e.target.value })}
                  placeholder="e.g., 5000000"
                />
              
            
            
              
                {ACCOUNT_ADDRESS_LABELS.hqCity}
                 setEditForm({ ...editForm, hqCity: e.target.value })}
                />
              
              
                {ACCOUNT_ADDRESS_LABELS.hqState}
                 setEditForm({ ...editForm, hqState: e.target.value })}
                />
              
              
                {ACCOUNT_ADDRESS_LABELS.hqCountry}
                 setEditForm({ ...editForm, hqCountry: e.target.value })}
                />
              
            
            
              
                {ACCOUNT_FIELD_LABELS.mainPhone}
                 setEditForm({ ...editForm, mainPhone: e.target.value })}
                />
              
              
                {ACCOUNT_FIELD_LABELS.linkedinUrl}
                 setEditForm({ ...editForm, linkedinUrl: e.target.value })}
                />
              
            
            
              {ACCOUNT_FIELD_LABELS.list}
               setEditForm({ ...editForm, list: e.target.value })}
                placeholder="e.g., InFynd, ZoomInfo"
              />
            
            
              {ACCOUNT_FIELD_LABELS.description}
               setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
              />
            
            
              
                Custom Fields 
                (JSON format)
              
               setEditForm({ ...editForm, customFields: e.target.value })}
                rows={6}
                className="font-mono text-sm"
                placeholder='{"field_name": "value", "another_field": "another value"}'
                data-testid="input-custom-fields"
              />
              
                Enter custom fields as JSON key-value pairs
              
            
          
          
             setEditDialogOpen(false)}>
              Cancel
            
            
              {updateAccountMutation.isPending ? "Saving..." : "Save Changes"}
            
          
        
      
    
  );
}