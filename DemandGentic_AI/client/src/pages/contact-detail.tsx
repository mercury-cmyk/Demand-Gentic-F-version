import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  User, 
  ChevronLeft,
  ChevronRight,
  Building2,
  Mail,
  Phone,
  Briefcase,
  Tag,
  Activity,
  FileText,
  Shield,
  TrendingUp,
  MapPin,
  Calendar,
  List,
  Target,
  Linkedin
} from "lucide-react";
import type { Contact, Account, PipelineOpportunity } from "@shared/schema";
import { HeaderActionBar } from "@/components/shared/header-action-bar";
import { SectionCard } from "@/components/shared/section-card";
import { ListSegmentMembership } from "@/components/list-segment-membership";
import { ActivityLogTimeline } from "@/components/activity-log-timeline";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { CONTACT_FIELD_LABELS, CONTACT_ADDRESS_LABELS } from "@shared/field-labels";

export default function ContactDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    directPhone: "",
    jobTitle: "",
    department: "",
    seniorityLevel: "",
    customFields: "", // JSON string for custom fields
  });

  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: [`/api/contacts/${id}`],
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
  });

  const { data: accounts } = useQuery({
    queryKey: ['/api/accounts'],
  });

  // Fetch the specific account for this contact
  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: [`/api/accounts/${contact?.accountId}`],
    enabled: !!contact?.accountId,
  });

  const { data: opportunities = [], isLoading: opportunitiesLoading } = useQuery>({
    queryKey: [`/api/contacts/${id}/opportunities`],
    enabled: !!id,
  });

  const currentIndex = contacts.findIndex(c => c.id === id);
  const prevContact = currentIndex > 0 ? contacts[currentIndex - 1] : null;
  const nextContact = currentIndex  {
      const response = await apiRequest('PATCH', `/api/contacts/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      setEditDialogOpen(false);
      toast({
        title: "Success",
        description: "Contact updated successfully",
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
    if (contact) {
      setEditForm({
        firstName: contact.firstName || "",
        lastName: contact.lastName || "",
        email: contact.email || "",
        directPhone: contact.directPhone || "",
        jobTitle: contact.jobTitle || "",
        department: contact.department || "",
        seniorityLevel: contact.seniorityLevel || "",
        customFields: contact.customFields ? JSON.stringify(contact.customFields, null, 2) : "",
      });
      setEditDialogOpen(true);
    }
  };

  const handleSaveEdit = () => {
    const updateData: any = { ...editForm };
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
    updateContactMutation.mutate(updateData);
  };

  if (contactLoading || accountLoading) {
    return (
      
        
          
        
        
          
          
        
      
    );
  }

  if (!contact) {
    return (
      
        Contact not found
         setLocation('/contacts')} className="mt-4">
          Back to Contacts
        
      
    );
  }

  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  const initials = `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.toUpperCase();

  const headerActions = [
    {
      type: "linkedin" as const,
      value: contact.linkedinUrl || undefined,
      label: "View LinkedIn Profile",
    },
    {
      type: "call" as const,
      value: contact.directPhone ?? undefined,
      label: "Call Direct Line",
    },
    {
      type: "email" as const,
      value: contact.email || undefined,
      label: "Send Email",
    },
    {
      type: "copy" as const,
      value: contact.email || undefined,
      label: "Copy Email",
    },
  ];

  const badges = [
    contact.jobTitle && {
      label: contact.jobTitle,
      variant: "default" as const,
    },
    contact.department && {
      label: contact.department,
      variant: "outline" as const,
    },
  ].filter(Boolean) as Array;

  return (
    
      {/* Breadcrumb */}
      
        
          
            Contacts
          
          {account && (
            <>
              
              
                {account.name}
              
            
          )}
          
          
            {fullName || "Contact"}
          
        
      

      {/* Header Action Bar */}
      
             prevContact && setLocation(`/contacts/${prevContact.id}`)}
              disabled={!prevContact}
              data-testid="button-prev-contact"
              className="h-9 w-9 rounded-lg border border-border/50 hover:border-border hover:bg-accent/50 disabled:opacity-30"
            >
              
            
             nextContact && setLocation(`/contacts/${nextContact.id}`)}
              disabled={!nextContact}
              data-testid="button-next-contact"
              className="h-9 w-9 rounded-lg border border-border/50 hover:border-border hover:bg-accent/50 disabled:opacity-30"
            >
              
            
          
        }
      />

      {/* Main Content - Two Column Layout */}
      
        
          {/* Left Column - Primary Content (2/3) */}
          
            {/* Contact Information */}
            
                  Edit Details
                
              }
            >
              
                
                  Full Name
                  {fullName || "-"}
                

                
                  {CONTACT_FIELD_LABELS.jobTitle}
                  
                    
                    {contact.jobTitle || "-"}
                  
                

                
                  Location
                  
                    
                    {[contact.city, contact.state, contact.country].filter(Boolean).join(", ") || "-"}
                  
                

                
                  LinkedIn Profile
                  {contact.linkedinUrl ? (
                    
                      
                      View Profile
                    
                  ) : (
                    -
                  )}
                

                
                  {CONTACT_FIELD_LABELS.email}
                  
                    
                    {contact.email}
                  
                

                
                  {CONTACT_FIELD_LABELS.department}
                  {contact.department || "-"}
                

                
                  {CONTACT_FIELD_LABELS.seniorityLevel}
                  {contact.seniorityLevel || "-"}
                

                
                  {CONTACT_FIELD_LABELS.directPhone}
                  {contact.directPhoneE164 ? (
                    
                      
                        
                        {contact.directPhone}
                      
                      {contact.phoneExtension && (
                        Ext: {contact.phoneExtension}
                      )}
                    
                  ) : (
                    -
                  )}
                

                
                  {CONTACT_FIELD_LABELS.mobilePhone}
                  {contact.mobilePhoneE164 ? (
                    
                      
                      {contact.mobilePhone}
                    
                  ) : (
                    -
                  )}
                

                
                  {CONTACT_FIELD_LABELS.emailVerificationStatus}
                  
                    {contact.emailVerificationStatus || 'unknown'}
                  
                

                
                  {CONTACT_ADDRESS_LABELS.city}
                  
                    
                    {contact.city || "-"}
                  
                

                
                  {CONTACT_ADDRESS_LABELS.state}
                  {contact.state || "-"}
                

                
                  {CONTACT_ADDRESS_LABELS.county}
                  {contact.county || "-"}
                

                
                  {CONTACT_ADDRESS_LABELS.postalCode}
                  {contact.postalCode || "-"}
                

                
                  {CONTACT_ADDRESS_LABELS.country}
                  {contact.country || "-"}
                
              

              {/* Additional Address Information */}
              {(contact.address || contact.contactLocation) && (
                
                  Additional Address Details
                  
                    {contact.address && (
                      
                        {CONTACT_ADDRESS_LABELS.address}
                        {contact.address}
                      
                    )}
                    {contact.contactLocation && (
                      
                        {CONTACT_ADDRESS_LABELS.contactLocation}
                        {contact.contactLocation}
                      
                    )}
                  
                
              )}

              {contact.intentTopics && contact.intentTopics.length > 0 && (
                
                  Intent Signals
                  
                    {contact.intentTopics.map((topic, idx) => (
                      
                        {topic}
                      
                    ))}
                  
                
              )}

              {/* Professional History */}
              {(contact.formerPosition || contact.timeInCurrentPosition || contact.timeInCurrentCompany) && (
                
                  Professional History
                  
                    {contact.formerPosition && (
                      
                        {CONTACT_FIELD_LABELS.formerPosition}
                        {contact.formerPosition}
                      
                    )}
                    {contact.timeInCurrentPosition && (
                      
                        {CONTACT_FIELD_LABELS.timeInCurrentPosition}
                        {contact.timeInCurrentPosition}{contact.timeInCurrentPositionMonths ? ` (${contact.timeInCurrentPositionMonths} months)` : ''}
                      
                    )}
                    {contact.timeInCurrentCompany && (
                      
                        {CONTACT_FIELD_LABELS.timeInCurrentCompany}
                        {contact.timeInCurrentCompany}{contact.timeInCurrentCompanyMonths ? ` (${contact.timeInCurrentCompanyMonths} months)` : ''}
                      
                    )}
                  
                
              )}

              {/* Data Quality & Source */}
              {(contact.emailAiConfidence || contact.phoneAiConfidence || contact.sourceSystem || contact.researchDate) && (
                
                  Data Quality & Source
                  
                    {contact.emailAiConfidence && (
                      
                        {CONTACT_FIELD_LABELS.emailAiConfidence}
                        
                          {Math.round(parseFloat(contact.emailAiConfidence) * 100)}% confidence
                        
                      
                    )}
                    {contact.phoneAiConfidence && (
                      
                        {CONTACT_FIELD_LABELS.phoneAiConfidence}
                        
                          {Math.round(parseFloat(contact.phoneAiConfidence) * 100)}% confidence
                        
                      
                    )}
                    {contact.sourceSystem && (
                      
                        {CONTACT_FIELD_LABELS.sourceSystem}
                        {contact.sourceSystem}
                      
                    )}
                    {contact.researchDate && (
                      
                        {CONTACT_FIELD_LABELS.researchDate}
                        
                          {new Date(contact.researchDate).toLocaleDateString()}
                        
                      
                    )}
                    {contact.timezone && (
                      
                        {CONTACT_ADDRESS_LABELS.timezone}
                        {contact.timezone}
                      
                    )}
                    {contact.list && (
                      
                        {CONTACT_FIELD_LABELS.list}
                        {contact.list}
                      
                    )}
                  
                
              )}

              {/* Custom Fields */}
              {contact.customFields && Object.keys(contact.customFields).length > 0 && (
                
                  Custom Fields
                  
                    {Object.entries(contact.customFields).map(([key, value]) => (
                      
                        
                          {key.replace(/_/g, ' ')}
                        
                        
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        
                      
                    ))}
                  
                
              )}
            

            {/* Linked Account */}
            {account && (
               setLocation(`/accounts/${account.id}`)}
                    data-testid="button-view-company"
                  >
                    View Full Profile
                  
                }
              >
                 setLocation(`/accounts/${account.id}`)}
                >
                  
                    
                  
                  
                    {account.name}
                    {account.domain || "-"}
                  
                

                
                  
                    Industry
                    {account.industryStandardized || "-"}
                  
                  
                    Employee Size
                    {account.employeesSizeRange || "-"}
                  
                  
                    Revenue Range
                    {account.revenueRange || account.annualRevenue || "-"}
                  
                  
                    HQ Location
                    
                      {[account.hqCity, account.hqState, account.hqCountry].filter(Boolean).join(", ") || "-"}
                    
                  
                  
                    HQ Phone
                    {account.mainPhoneE164 ? (
                      
                        {account.mainPhone || account.mainPhoneE164}
                      
                    ) : (
                      {account.mainPhone || "-"}
                    )}
                  
                  
                    LinkedIn Profile
                    {account.linkedinUrl ? (
                      
                        
                        View Profile
                      
                    ) : (
                      -
                    )}
                  
                
              
            )}

            {/* Related Deals */}
            
              {opportunitiesLoading ? (
                
                  {[1, 2, 3].map(i => (
                    
                  ))}
                
              ) : opportunities.length > 0 ? (
                
                  {opportunities.map((opp) => (
                     setLocation(`/pipeline/pivotal?pipeline=${opp.pipelineId}&deal=${opp.id}`)}
                      data-testid={`card-opportunity-${opp.id}`}
                    >
                      
                        
                          {opp.name}
                          {opp.pipelineName}
                        
                        {opp.stage}
                      
                      
                        
                          Value
                          
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            }).format(Number(opp.amount) || 0)}
                          
                        
                        
                          Probability
                          {opp.probability ? `${opp.probability}%` : '-'}
                        
                        
                          Expected Close
                          
                            {opp.closeDate 
                              ? new Date(opp.closeDate).toLocaleDateString()
                              : '-'}
                          
                        
                      
                    
                  ))}
                
              ) : (
                
                  
                  No deals linked to this contact
                   setLocation('/pipeline/pivotal')}
                    data-testid="button-create-first-deal"
                  >
                    
                    Create First Deal
                  
                
              )}
            

            {/* Lists & Segments */}
            
              
            

            {/* Activity Timeline */}
            
              
            

            {/* M365 Email Activity */}
            
              
            
          

          {/* Right Column - Contextual Actions & Info (1/3) */}
          
            {/* Quick Actions */}
            
              
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
                
                 {
                    toast({
                      title: "Coming Soon",
                      description: "Task scheduling will be available soon",
                    });
                  }}
                >
                  
                  Schedule Task
                
              
            

            {/* Data Quality */}
            
              {(() => {
                // Calculate data completeness for this contact
                const keyFields = [
                  'firstName', 'lastName', 'jobTitle', 'department', 'seniorityLevel',
                  'directPhone', 'mobilePhone', 'city', 'state', 'postalCode', 'country',
                  'linkedinUrl', 'accountId', 'address', 'timezone'
                ];

                const populatedFields = keyFields.filter(field => {
                  const value = (contact as any)[field];
                  return value !== null && value !== undefined && value !== '';
                });

                const missingFields = keyFields.filter(field => {
                  const value = (contact as any)[field];
                  return value === null || value === undefined || value === '';
                });

                const completeness = Math.round((populatedFields.length / keyFields.length) * 100);

                // Determine quality badge
                const getQualityBadge = (score: number) => {
                  if (score >= 80) return { label: 'Excellent', className: 'bg-green-500/10 text-green-500 border-green-500/20' };
                  if (score >= 60) return { label: 'Good', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
                  if (score >= 40) return { label: 'Fair', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' };
                  return { label: 'Poor', className: 'bg-red-500/10 text-red-500 border-red-500/20' };
                };

                const quality = getQualityBadge(completeness);

                // Field name mapping for display using centralized labels
                const fieldLabels: Record = {
                  firstName: CONTACT_FIELD_LABELS.firstName,
                  lastName: CONTACT_FIELD_LABELS.lastName,
                  jobTitle: CONTACT_FIELD_LABELS.jobTitle,
                  department: CONTACT_FIELD_LABELS.department,
                  seniorityLevel: CONTACT_FIELD_LABELS.seniorityLevel,
                  directPhone: CONTACT_FIELD_LABELS.directPhone,
                  mobilePhone: CONTACT_FIELD_LABELS.mobilePhone,
                  city: CONTACT_ADDRESS_LABELS.city,
                  state: CONTACT_ADDRESS_LABELS.state,
                  postalCode: CONTACT_ADDRESS_LABELS.postalCode,
                  country: CONTACT_ADDRESS_LABELS.country,
                  linkedinUrl: CONTACT_FIELD_LABELS.linkedinUrl,
                  accountId: 'Account',
                  address: CONTACT_ADDRESS_LABELS.address,
                  timezone: CONTACT_ADDRESS_LABELS.timezone
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
            

            {/* Contact Status */}
            
              
                
                  Email Status
                  
                    {contact.emailVerificationStatus || 'unknown'}
                  
                
                
                  Consent
                  {contact.consentBasis || "Not specified"}
                
                {contact.consentSource && (
                  
                    Source
                    {contact.consentSource}
                  
                )}
              
            

            {/* Tags */}
            {contact.tags && contact.tags.length > 0 && (
              
                
                  {contact.tags.map((tag, idx) => (
                    
                      {tag}
                    
                  ))}
                
              
            )}

            {/* Metadata */}
            
              
                
                  Created
                  {contact.createdAt ? new Date(contact.createdAt).toLocaleDateString() : "N/A"}
                
                
                  Updated
                  {contact.updatedAt ? new Date(contact.updatedAt).toLocaleDateString() : "N/A"}
                
              
            
          
        
      

      {/* Edit Contact Dialog */}
      
        
          
            Edit Contact Details
            Update contact information below.
          
          
            
              
                {CONTACT_FIELD_LABELS.firstName}
                 setEditForm({ ...editForm, firstName: e.target.value })}
                />
              
              
                {CONTACT_FIELD_LABELS.lastName}
                 setEditForm({ ...editForm, lastName: e.target.value })}
                />
              
            
            
              
                {CONTACT_FIELD_LABELS.email} *
                 setEditForm({ ...editForm, email: e.target.value })}
                />
              
              
                {CONTACT_FIELD_LABELS.directPhone}
                 setEditForm({ ...editForm, directPhone: e.target.value })}
                />
              
            
            
              
                {CONTACT_FIELD_LABELS.jobTitle}
                 setEditForm({ ...editForm, jobTitle: e.target.value })}
                />
              
              
                {CONTACT_FIELD_LABELS.department}
                 setEditForm({ ...editForm, department: e.target.value })}
                />
              
            
            
              {CONTACT_FIELD_LABELS.seniorityLevel}
               setEditForm({ ...editForm, seniorityLevel: e.target.value })}
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
            
            
              {updateContactMutation.isPending ? "Saving..." : "Save Changes"}
            
          
        
      
    
  );
}