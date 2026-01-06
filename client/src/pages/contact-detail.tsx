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
  const { id } = useParams<{ id: string }>();
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

  const { data: contact, isLoading: contactLoading } = useQuery<Contact>({
    queryKey: [`/api/contacts/${id}`],
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ['/api/contacts'],
  });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['/api/accounts'],
  });

  // Fetch the specific account for this contact
  const { data: account, isLoading: accountLoading } = useQuery<Account>({
    queryKey: [`/api/accounts/${contact?.accountId}`],
    enabled: !!contact?.accountId,
  });

  const { data: opportunities = [], isLoading: opportunitiesLoading } = useQuery<Array<PipelineOpportunity & { pipelineName: string; pipelineId: string }>>({
    queryKey: [`/api/contacts/${id}/opportunities`],
    enabled: !!id,
  });

  const currentIndex = contacts.findIndex(c => c.id === id);
  const prevContact = currentIndex > 0 ? contacts[currentIndex - 1] : null;
  const nextContact = currentIndex < contacts.length - 1 ? contacts[currentIndex + 1] : null;

  const updateContactMutation = useMutation({
    mutationFn: async (data: any) => {
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
      <div className="h-full flex flex-col">
        <div className="border-b p-6">
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Contact not found</p>
        <Button variant="outline" onClick={() => setLocation('/contacts')} className="mt-4">
          Back to Contacts
        </Button>
      </div>
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
  ].filter(Boolean) as Array<{ label: string; variant?: any; className?: string }>;

  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumb */}
      <div className="border-b px-6 py-3">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/contacts" className="hover:text-foreground" data-testid="breadcrumb-contacts">
            Contacts
          </Link>
          {account && (
            <>
              <ChevronRight className="h-4 w-4" />
              <Link 
                href={`/accounts/${account.id}`} 
                className="hover:text-foreground"
                data-testid="breadcrumb-account"
              >
                {account.name}
              </Link>
            </>
          )}
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium" data-testid="breadcrumb-contact-name">
            {fullName || "Contact"}
          </span>
        </nav>
      </div>

      {/* Header Action Bar */}
      <HeaderActionBar
        avatarFallback={initials}
        title={fullName || "No name"}
        subtitle={account?.name}
        badges={badges}
        actions={headerActions}
        loading={contactLoading}
        rightContent={
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => prevContact && setLocation(`/contacts/${prevContact.id}`)}
              disabled={!prevContact}
              data-testid="button-prev-contact"
              className="h-9 w-9 rounded-lg border border-border/50 hover:border-border hover:bg-accent/50 disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => nextContact && setLocation(`/contacts/${nextContact.id}`)}
              disabled={!nextContact}
              data-testid="button-next-contact"
              className="h-9 w-9 rounded-lg border border-border/50 hover:border-border hover:bg-accent/50 disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        }
      />

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Primary Content (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Information */}
            <SectionCard
              title="Contact Information"
              icon={User}
              action={
                <Button variant="outline" size="sm" onClick={handleEditClick}>
                  Edit Details
                </Button>
              }
            >
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Full Name</p>
                  <p className="font-medium text-base">{fullName || "-"}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.jobTitle}</p>
                  <p className="font-medium flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                    {contact.jobTitle || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Location</p>
                  <p className="font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    {[contact.city, contact.state, contact.country].filter(Boolean).join(", ") || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">LinkedIn Profile</p>
                  {contact.linkedinUrl ? (
                    <a 
                      href={contact.linkedinUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                      data-testid="link-contact-linkedin"
                    >
                      <Linkedin className="h-3 w-3" />
                      View Profile
                    </a>
                  ) : (
                    <p className="font-medium text-muted-foreground">-</p>
                  )}
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.email}</p>
                  <p className="font-mono text-sm flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    {contact.email}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.department}</p>
                  <p className="font-medium">{contact.department || "-"}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.seniorityLevel}</p>
                  <p className="font-medium">{contact.seniorityLevel || "-"}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.directPhone}</p>
                  {contact.directPhoneE164 ? (
                    <div className="space-y-1">
                      <a href={`tel:${contact.directPhoneE164}`} className="font-medium text-primary hover:underline flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {contact.directPhone}
                      </a>
                      {contact.phoneExtension && (
                        <p className="text-xs text-muted-foreground pl-5">Ext: {contact.phoneExtension}</p>
                      )}
                    </div>
                  ) : (
                    <p className="font-medium">-</p>
                  )}
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.mobilePhone}</p>
                  {contact.mobilePhoneE164 ? (
                    <a href={`tel:${contact.mobilePhoneE164}`} className="font-medium text-primary hover:underline flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      {contact.mobilePhone}
                    </a>
                  ) : (
                    <p className="font-medium">-</p>
                  )}
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.emailVerificationStatus}</p>
                  <Badge variant={contact.emailVerificationStatus === 'valid' ? 'default' : 'secondary'}>
                    {contact.emailVerificationStatus || 'unknown'}
                  </Badge>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">{CONTACT_ADDRESS_LABELS.city}</p>
                  <p className="font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    {contact.city || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">{CONTACT_ADDRESS_LABELS.state}</p>
                  <p className="font-medium">{contact.state || "-"}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">{CONTACT_ADDRESS_LABELS.county}</p>
                  <p className="font-medium">{contact.county || "-"}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">{CONTACT_ADDRESS_LABELS.postalCode}</p>
                  <p className="font-medium">{contact.postalCode || "-"}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">{CONTACT_ADDRESS_LABELS.country}</p>
                  <p className="font-medium">{contact.country || "-"}</p>
                </div>
              </div>

              {/* Additional Address Information */}
              {(contact.address || contact.contactLocation) && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-3">Additional Address Details</p>
                  <div className="space-y-3">
                    {contact.address && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">{CONTACT_ADDRESS_LABELS.address}</p>
                        <p className="font-medium text-sm">{contact.address}</p>
                      </div>
                    )}
                    {contact.contactLocation && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">{CONTACT_ADDRESS_LABELS.contactLocation}</p>
                        <p className="font-medium text-sm">{contact.contactLocation}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {contact.intentTopics && contact.intentTopics.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-2">Intent Signals</p>
                  <div className="flex flex-wrap gap-2">
                    {contact.intentTopics.map((topic, idx) => (
                      <Badge key={idx} className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Professional History */}
              {(contact.formerPosition || contact.timeInCurrentPosition || contact.timeInCurrentCompany) && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-3">Professional History</p>
                  <div className="grid grid-cols-2 gap-4">
                    {contact.formerPosition && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.formerPosition}</p>
                        <p className="font-medium text-sm">{contact.formerPosition}</p>
                      </div>
                    )}
                    {contact.timeInCurrentPosition && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.timeInCurrentPosition}</p>
                        <p className="font-medium text-sm">{contact.timeInCurrentPosition}{contact.timeInCurrentPositionMonths ? ` (${contact.timeInCurrentPositionMonths} months)` : ''}</p>
                      </div>
                    )}
                    {contact.timeInCurrentCompany && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.timeInCurrentCompany}</p>
                        <p className="font-medium text-sm">{contact.timeInCurrentCompany}{contact.timeInCurrentCompanyMonths ? ` (${contact.timeInCurrentCompanyMonths} months)` : ''}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Data Quality & Source */}
              {(contact.emailAiConfidence || contact.phoneAiConfidence || contact.sourceSystem || contact.researchDate) && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-3">Data Quality & Source</p>
                  <div className="grid grid-cols-2 gap-4">
                    {contact.emailAiConfidence && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.emailAiConfidence}</p>
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(parseFloat(contact.emailAiConfidence) * 100)}% confidence
                        </Badge>
                      </div>
                    )}
                    {contact.phoneAiConfidence && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.phoneAiConfidence}</p>
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(parseFloat(contact.phoneAiConfidence) * 100)}% confidence
                        </Badge>
                      </div>
                    )}
                    {contact.sourceSystem && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.sourceSystem}</p>
                        <p className="font-medium text-sm">{contact.sourceSystem}</p>
                      </div>
                    )}
                    {contact.researchDate && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.researchDate}</p>
                        <p className="font-medium text-sm">
                          {new Date(contact.researchDate).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {contact.timezone && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">{CONTACT_ADDRESS_LABELS.timezone}</p>
                        <p className="font-medium text-sm">{contact.timezone}</p>
                      </div>
                    )}
                    {contact.list && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">{CONTACT_FIELD_LABELS.list}</p>
                        <p className="font-medium text-sm">{contact.list}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Custom Fields */}
              {contact.customFields && Object.keys(contact.customFields).length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-3">Custom Fields</p>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(contact.customFields).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-sm text-muted-foreground mb-1 capitalize">
                          {key.replace(/_/g, ' ')}
                        </p>
                        <p className="font-medium text-sm">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Linked Account */}
            {account && (
              <SectionCard
                title="Account Information"
                icon={Building2}
                action={
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setLocation(`/accounts/${account.id}`)}
                    data-testid="button-view-company"
                  >
                    View Full Profile
                  </Button>
                }
              >
                <div 
                  className="flex items-center gap-4 p-4 border rounded-lg hover-elevate cursor-pointer"
                  onClick={() => setLocation(`/accounts/${account.id}`)}
                >
                  <div className="h-16 w-16 rounded bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold">{account.name}</h3>
                    <p className="text-sm text-muted-foreground font-mono">{account.domain || "-"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Industry</p>
                    <p className="font-medium">{account.industryStandardized || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Employee Size</p>
                    <p className="font-medium">{account.employeesSizeRange || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Revenue Range</p>
                    <p className="font-medium">{account.revenueRange || account.annualRevenue || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">HQ Location</p>
                    <p className="font-medium">
                      {[account.hqCity, account.hqState, account.hqCountry].filter(Boolean).join(", ") || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">HQ Phone</p>
                    {account.mainPhoneE164 ? (
                      <a href={`tel:${account.mainPhoneE164}`} className="font-medium font-mono text-primary hover:underline">
                        {account.mainPhone || account.mainPhoneE164}
                      </a>
                    ) : (
                      <p className="font-medium font-mono">{account.mainPhone || "-"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">LinkedIn Profile</p>
                    {account.linkedinUrl ? (
                      <a 
                        href={account.linkedinUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                        data-testid="link-account-linkedin"
                      >
                        <Linkedin className="h-3 w-3" />
                        View Profile
                      </a>
                    ) : (
                      <p className="font-medium text-muted-foreground">-</p>
                    )}
                  </div>
                </div>
              </SectionCard>
            )}

            {/* Related Deals */}
            <SectionCard
              title="Related Deals"
              icon={Target}
              description={`${opportunities.length} active deal${opportunities.length !== 1 ? 's' : ''} in pipeline`}
            >
              {opportunitiesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : opportunities.length > 0 ? (
                <div className="space-y-3">
                  {opportunities.map((opp) => (
                    <div 
                      key={opp.id}
                      className="p-4 border rounded-lg hover-elevate cursor-pointer"
                      onClick={() => setLocation(`/pipeline/pivotal?pipeline=${opp.pipelineId}&deal=${opp.id}`)}
                      data-testid={`card-opportunity-${opp.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate">{opp.name}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{opp.pipelineName}</p>
                        </div>
                        <Badge variant="secondary">{opp.stage}</Badge>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <div>
                          <p className="text-sm text-muted-foreground">Value</p>
                          <p className="font-mono font-medium">
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            }).format(Number(opp.amount) || 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Probability</p>
                          <p className="font-medium">{opp.probability ? `${opp.probability}%` : '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Expected Close</p>
                          <p className="text-sm">
                            {opp.closeDate 
                              ? new Date(opp.closeDate).toLocaleDateString()
                              : '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Target className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No deals linked to this contact</p>
                  <Button 
                    size="sm" 
                    className="mt-4"
                    onClick={() => setLocation('/pipeline/pivotal')}
                    data-testid="button-create-first-deal"
                  >
                    <Target className="mr-2 h-4 w-4" />
                    Create First Deal
                  </Button>
                </div>
              )}
            </SectionCard>

            {/* Lists & Segments */}
            <SectionCard
              title="Lists & Segments"
              icon={List}
              description="Membership in static lists and dynamic segments"
            >
              <ListSegmentMembership entityType="contact" entityId={id || ''} />
            </SectionCard>

            {/* Activity Timeline */}
            <SectionCard
              title="Activity Timeline"
              icon={Activity}
              description="Recent interactions and events"
            >
              <ActivityLogTimeline 
                entityType="contact" 
                entityId={id || ''} 
                autoRefresh={true}
                refreshInterval={30000}
              />
            </SectionCard>

            {/* M365 Email Activity */}
            <SectionCard
              title="Email Activity"
              icon={Mail}
              description="Microsoft 365 email interactions"
            >
              <ActivityTimeline contactId={id} limit={20} />
            </SectionCard>
          </div>

          {/* Right Column - Contextual Actions & Info (1/3) */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <SectionCard title="Quick Actions" icon={TrendingUp}>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  size="sm"
                  onClick={() => {
                    toast({
                      title: "Coming Soon",
                      description: "Add to List functionality will be available soon",
                    });
                  }}
                >
                  <List className="mr-2 h-4 w-4" />
                  Add to List
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  size="sm"
                  onClick={() => {
                    toast({
                      title: "Coming Soon",
                      description: "Notes functionality will be available soon",
                    });
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Create Note
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  size="sm"
                  onClick={() => {
                    toast({
                      title: "Coming Soon",
                      description: "Task scheduling will be available soon",
                    });
                  }}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule Task
                </Button>
              </div>
            </SectionCard>

            {/* Data Quality */}
            <SectionCard title="Data Quality" icon={Shield}>
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
                const fieldLabels: Record<string, string> = {
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
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Completeness Score</span>
                      <Badge className={quality.className}>
                        {completeness}% - {quality.label}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{populatedFields.length} of {keyFields.length} key fields</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            completeness >= 80 ? 'bg-green-500' :
                            completeness >= 60 ? 'bg-blue-500' :
                            completeness >= 40 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${completeness}%` }}
                        />
                      </div>
                    </div>

                    {missingFields.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Missing Fields ({missingFields.length})</p>
                        <div className="flex flex-wrap gap-1">
                          {missingFields.slice(0, 8).map(field => (
                            <Badge key={field} variant="outline" className="text-xs">
                              {fieldLabels[field] || field}
                            </Badge>
                          ))}
                          {missingFields.length > 8 && (
                            <Badge variant="outline" className="text-xs">
                              +{missingFields.length - 8} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </SectionCard>

            {/* Contact Status */}
            <SectionCard title="Contact Status" icon={Shield}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Email Status</span>
                  <Badge variant={contact.emailVerificationStatus === 'valid' ? 'default' : 'secondary'}>
                    {contact.emailVerificationStatus || 'unknown'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Consent</span>
                  <span className="text-sm font-medium">{contact.consentBasis || "Not specified"}</span>
                </div>
                {contact.consentSource && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Source</span>
                    <span className="text-sm font-medium">{contact.consentSource}</span>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Tags */}
            {contact.tags && contact.tags.length > 0 && (
              <SectionCard title="Tags" icon={Tag}>
                <div className="flex flex-wrap gap-2">
                  {contact.tags.map((tag, idx) => (
                    <Badge key={idx} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Metadata */}
            <SectionCard title="Metadata" icon={FileText}>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{contact.createdAt ? new Date(contact.createdAt).toLocaleDateString() : "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span>{contact.updatedAt ? new Date(contact.updatedAt).toLocaleDateString() : "N/A"}</span>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>

      {/* Edit Contact Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Contact Details</DialogTitle>
            <DialogDescription>Update contact information below.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">{CONTACT_FIELD_LABELS.firstName}</Label>
                <Input
                  id="firstName"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{CONTACT_FIELD_LABELS.lastName}</Label>
                <Input
                  id="lastName"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">{CONTACT_FIELD_LABELS.email} *</Label>
                <Input
                  id="email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="directPhone">{CONTACT_FIELD_LABELS.directPhone}</Label>
                <Input
                  id="directPhone"
                  value={editForm.directPhone}
                  onChange={(e) => setEditForm({ ...editForm, directPhone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="jobTitle">{CONTACT_FIELD_LABELS.jobTitle}</Label>
                <Input
                  id="jobTitle"
                  value={editForm.jobTitle}
                  onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">{CONTACT_FIELD_LABELS.department}</Label>
                <Input
                  id="department"
                  value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="seniorityLevel">{CONTACT_FIELD_LABELS.seniorityLevel}</Label>
              <Input
                id="seniorityLevel"
                value={editForm.seniorityLevel}
                onChange={(e) => setEditForm({ ...editForm, seniorityLevel: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customFields">
                Custom Fields 
                <span className="text-xs text-muted-foreground ml-2">(JSON format)</span>
              </Label>
              <Textarea
                id="customFields"
                value={editForm.customFields}
                onChange={(e) => setEditForm({ ...editForm, customFields: e.target.value })}
                rows={6}
                className="font-mono text-sm"
                placeholder='{"field_name": "value", "another_field": "another value"}'
                data-testid="input-custom-fields"
              />
              <p className="text-xs text-muted-foreground">
                Enter custom fields as JSON key-value pairs
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateContactMutation.isPending}>
              {updateContactMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}