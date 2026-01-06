import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/patterns/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2, User, Mail, Phone, MapPin, Calendar, DollarSign,
  TrendingUp, Target, Sparkles, FileText, Activity, ArrowLeft,
  ExternalLink, Edit, MessageSquare, PhoneCall, Video, Briefcase,
  Globe, Linkedin, Clock, BarChart3, Zap, Brain, FileStack, Send, ArrowDownToLine
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ActivityTimeline } from "@/components/pipeline/activity-timeline";
import { AIInsightsPanel } from "@/components/pipeline/ai-insights-panel";
import { EmailConversationViewer } from "@/components/pipeline/email-conversation-viewer";
import { ScoreHistoryChart } from "@/components/pipeline/score-history-chart";
import { SendEmailDialog } from "@/components/pipeline/send-email-dialog";

interface Opportunity {
  id: string;
  pipelineId: string;
  pipelineName?: string;
  accountId: string | null;
  accountName?: string;
  contactId?: string | null;
  contactName?: string;
  ownerId?: string | null;
  ownerName?: string;
  name: string;
  stage: string;
  status: string;
  amount: string;
  currency: string;
  probability: number;
  closeDate: string | null;
  forecastCategory: string;
  flaggedForSla: boolean;
  reason?: string | null;
  
  // Partnership fields
  partnerName?: string | null;
  partnershipType?: string | null;
  pricingModel?: string | null;
  costPerLead?: string | null;
  leadVolumeGoal?: number | null;
  qualityTier?: string | null;
  
  // Sales fields
  contractType?: string | null;
  intentScore?: number | null;
  leadSource?: string | null;
  
  createdAt: string;
  updatedAt: string;
}

interface Contact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  directPhone?: string;
  mobilePhone?: string;
  jobTitle?: string;
  department?: string;
  seniorityLevel?: string;
  linkedinUrl?: string;
  city?: string;
  state?: string;
  country?: string;
}

interface Account {
  id: string;
  name: string;
  domain?: string;
  industryStandardized?: string;
  employeesSizeRange?: string;
  revenueRange?: string;
  hqCity?: string;
  hqState?: string;
  hqCountry?: string;
  mainPhone?: string;
  companyLinkedinUrl?: string;
  description?: string;
  techStack?: string[];
}

interface M365Activity {
  id: string;
  activityType: 'email' | 'meeting' | 'call';
  direction: 'inbound' | 'outbound';
  subject: string;
  fromEmail: string;
  fromName?: string;
  toRecipients?: Array<{ name: string; address: string }>;
  bodyPreview?: string;
  receivedDateTime: string;
  sentDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
}

export default function OpportunityDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  const { data: opportunity, isLoading } = useQuery<Opportunity>({
    queryKey: [`/api/opportunities/${id}`],
  });

  const { data: contact } = useQuery<Contact>({
    queryKey: [`/api/contacts/${opportunity?.contactId}`],
    enabled: !!opportunity?.contactId,
  });

  const { data: account } = useQuery<Account>({
    queryKey: [`/api/accounts/${opportunity?.accountId}`],
    enabled: !!opportunity?.accountId,
  });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery<any[]>({
    queryKey: [`/api/opportunities/${id}/activities`],
    enabled: !!id,
  });

  const { data: insights = [], isLoading: insightsLoading } = useQuery<any[]>({
    queryKey: [`/api/opportunities/${id}/insights`],
    enabled: !!id,
  });

  const { data: scoreHistory = [], isLoading: scoreHistoryLoading } = useQuery<any[]>({
    queryKey: [`/api/opportunities/${id}/score-history`],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <PageShell
        title="Loading..."
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Pipeline", href: "/pipeline" },
          { label: "Opportunity" },
        ]}
      >
        <div className="flex items-center justify-center h-96">
          <div className="text-muted-foreground">Loading opportunity details...</div>
        </div>
      </PageShell>
    );
  }

  if (!opportunity) {
    return (
      <PageShell
        title="Opportunity Not Found"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Pipeline", href: "/pipeline" },
        ]}
      >
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">This opportunity could not be found.</p>
            <Button variant="outline" className="mt-4" onClick={() => setLocation("/pipeline")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Pipeline
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: opportunity.currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num || 0);
  };

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <PageShell
      title={opportunity.name}
      description={`${opportunity.pipelineName || 'Pipeline'} • ${opportunity.stage}`}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Pipeline", href: "/pipeline" },
        { label: opportunity.name },
      ]}
    >
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setLocation("/pipeline")}
              data-testid="button-back-to-pipeline"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-semibold" data-testid="text-opportunity-name">
                  {opportunity.name}
                </h1>
                <Badge variant={opportunity.status === 'won' ? 'default' : 'secondary'}>
                  {opportunity.status}
                </Badge>
                {opportunity.flaggedForSla && (
                  <Badge variant="destructive">SLA Risk</Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  {opportunity.stage}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {opportunity.ownerName || 'Unassigned'}
                </span>
                {opportunity.closeDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(opportunity.closeDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" data-testid="button-edit-opportunity">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <SendEmailDialog opportunityId={id!} />
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Deal Value</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(opportunity.amount)}</div>
              <p className="text-xs text-muted-foreground mt-1">{opportunity.currency}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Probability</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{opportunity.probability}%</div>
              <p className="text-xs text-muted-foreground mt-1">Win probability</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Weighted Value</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(parseFloat(opportunity.amount) * (opportunity.probability / 100))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Expected value</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Age</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.floor((new Date().getTime() - new Date(opportunity.createdAt).getTime()) / (1000 * 60 * 60 * 24))}d
              </div>
              <p className="text-xs text-muted-foreground mt-1">Days in pipeline</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Briefcase className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">
              <Activity className="h-4 w-4 mr-2" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="ai-insights" data-testid="tab-ai-insights">
              <Brain className="h-4 w-4 mr-2" />
              AI Insights
            </TabsTrigger>
            <TabsTrigger value="emails" data-testid="tab-emails">
              <Mail className="h-4 w-4 mr-2" />
              Emails
            </TabsTrigger>
            <TabsTrigger value="scores" data-testid="tab-scores">
              <BarChart3 className="h-4 w-4 mr-2" />
              Scores
            </TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FileStack className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Contact Information */}
              {contact && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Contact Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback>{getInitials(`${contact.firstName} ${contact.lastName}`)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-semibold">{contact.firstName} {contact.lastName}</h3>
                        <p className="text-sm text-muted-foreground">{contact.jobTitle}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setLocation(`/contacts/${contact.id}`)}
                        data-testid="button-view-contact"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      {contact.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a href={`mailto:${contact.email}`} className="hover:underline">
                            {contact.email}
                          </a>
                        </div>
                      )}
                      {contact.directPhone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <a href={`tel:${contact.directPhone}`} className="hover:underline">
                            {contact.directPhone}
                          </a>
                        </div>
                      )}
                      {contact.mobilePhone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <a href={`tel:${contact.mobilePhone}`} className="hover:underline">
                            {contact.mobilePhone} (Mobile)
                          </a>
                        </div>
                      )}
                      {contact.linkedinUrl && (
                        <div className="flex items-center gap-2 text-sm">
                          <Linkedin className="h-4 w-4 text-muted-foreground" />
                          <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            LinkedIn Profile
                          </a>
                        </div>
                      )}
                      {(contact.city || contact.state || contact.country) && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {[contact.city, contact.state, contact.country].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                    {(contact.department || contact.seniorityLevel) && (
                      <>
                        <Separator />
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {contact.department && (
                            <div>
                              <p className="text-muted-foreground">Department</p>
                              <p className="font-medium">{contact.department}</p>
                            </div>
                          )}
                          {contact.seniorityLevel && (
                            <div>
                              <p className="text-muted-foreground">Seniority</p>
                              <p className="font-medium">{contact.seniorityLevel}</p>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Account Information */}
              {account && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Account Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback>{getInitials(account.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-semibold">{account.name}</h3>
                        {account.domain && (
                          <p className="text-sm text-muted-foreground">{account.domain}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setLocation(`/accounts/${account.id}`)}
                        data-testid="button-view-account"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      {account.industryStandardized && (
                        <div className="flex items-center gap-2 text-sm">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          <span>{account.industryStandardized}</span>
                        </div>
                      )}
                      {account.employeesSizeRange && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{account.employeesSizeRange} employees</span>
                        </div>
                      )}
                      {account.revenueRange && (
                        <div className="flex items-center gap-2 text-sm">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span>{account.revenueRange} revenue</span>
                        </div>
                      )}
                      {(account.hqCity || account.hqState || account.hqCountry) && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {[account.hqCity, account.hqState, account.hqCountry].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}
                      {account.mainPhone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <a href={`tel:${account.mainPhone}`} className="hover:underline">
                            {account.mainPhone}
                          </a>
                        </div>
                      )}
                      {account.companyLinkedinUrl && (
                        <div className="flex items-center gap-2 text-sm">
                          <Linkedin className="h-4 w-4 text-muted-foreground" />
                          <a href={account.companyLinkedinUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            Company LinkedIn
                          </a>
                        </div>
                      )}
                    </div>
                    {account.description && (
                      <>
                        <Separator />
                        <div className="text-sm">
                          <p className="text-muted-foreground mb-1">Description</p>
                          <p className="line-clamp-3">{account.description}</p>
                        </div>
                      </>
                    )}
                    {account.techStack && account.techStack.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Tech Stack</p>
                          <div className="flex flex-wrap gap-1">
                            {account.techStack.map((tech, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {tech}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Deal Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Deal Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Stage</p>
                    <p className="font-medium">{opportunity.stage}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Forecast Category</p>
                    <p className="font-medium">{opportunity.forecastCategory}</p>
                  </div>
                  {opportunity.leadSource && (
                    <div>
                      <p className="text-sm text-muted-foreground">Lead Source</p>
                      <p className="font-medium">{opportunity.leadSource}</p>
                    </div>
                  )}
                  {opportunity.contractType && (
                    <div>
                      <p className="text-sm text-muted-foreground">Contract Type</p>
                      <p className="font-medium">{opportunity.contractType}</p>
                    </div>
                  )}
                </div>
                {opportunity.reason && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm">{opportunity.reason}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Timeline Tab */}
          <TabsContent value="activity">
            <ActivityTimeline 
              opportunityId={id!}
              activities={activities}
              isLoading={activitiesLoading}
            />
          </TabsContent>

          {/* AI Insights Tab */}
          <TabsContent value="ai-insights">
            <AIInsightsPanel 
              opportunityId={id!}
              insights={insights}
              isLoading={insightsLoading}
            />
          </TabsContent>

          {/* Email Conversations Tab */}
          <TabsContent value="emails">
            <EmailConversationViewer opportunityId={id!} />
          </TabsContent>

          {/* Score History Tab */}
          <TabsContent value="scores">
            <ScoreHistoryChart 
              opportunityId={id!}
              history={scoreHistory}
              isLoading={scoreHistoryLoading}
            />
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documents & Attachments
                </CardTitle>
                <CardDescription>
                  Proposals, contracts, and shared files
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <FileStack className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Document storage coming soon</p>
                  <p className="text-sm mt-2">Upload and manage opportunity-related files</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}
