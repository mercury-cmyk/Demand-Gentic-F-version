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
  toRecipients?: Array;
  bodyPreview?: string;
  receivedDateTime: string;
  sentDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
}

export default function OpportunityDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  const { data: opportunity, isLoading } = useQuery({
    queryKey: [`/api/opportunities/${id}`],
  });

  const { data: contact } = useQuery({
    queryKey: [`/api/contacts/${opportunity?.contactId}`],
    enabled: !!opportunity?.contactId,
  });

  const { data: account } = useQuery({
    queryKey: [`/api/accounts/${opportunity?.accountId}`],
    enabled: !!opportunity?.accountId,
  });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: [`/api/opportunities/${id}/activities`],
    enabled: !!id,
  });

  const { data: insights = [], isLoading: insightsLoading } = useQuery({
    queryKey: [`/api/opportunities/${id}/insights`],
    enabled: !!id,
  });

  const { data: scoreHistory = [], isLoading: scoreHistoryLoading } = useQuery({
    queryKey: [`/api/opportunities/${id}/score-history`],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      
        
          Loading opportunity details...
        
      
    );
  }

  if (!opportunity) {
    return (
      
        
          
            This opportunity could not be found.
             setLocation("/pipeline")}>
              
              Back to Pipeline
            
          
        
      
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
    
      
        {/* Header Section */}
        
          
             setLocation("/pipeline")}
              data-testid="button-back-to-pipeline"
            >
              
            
            
              
                
                  {opportunity.name}
                
                
                  {opportunity.status}
                
                {opportunity.flaggedForSla && (
                  SLA Risk
                )}
              
              
                
                  
                  {opportunity.stage}
                
                
                  
                  {opportunity.ownerName || 'Unassigned'}
                
                {opportunity.closeDate && (
                  
                    
                    {new Date(opportunity.closeDate).toLocaleDateString()}
                  
                )}
              
            
          
          
            
              
              Edit
            
            
          
        

        {/* Key Metrics */}
        
          
            
              Deal Value
            
            
              {formatCurrency(opportunity.amount)}
              {opportunity.currency}
            
          
          
            
              Probability
            
            
              {opportunity.probability}%
              Win probability
            
          
          
            
              Weighted Value
            
            
              
                {formatCurrency(parseFloat(opportunity.amount) * (opportunity.probability / 100))}
              
              Expected value
            
          
          
            
              Age
            
            
              
                {Math.floor((new Date().getTime() - new Date(opportunity.createdAt).getTime()) / (1000 * 60 * 60 * 24))}d
              
              Days in pipeline
            
          
        

        {/* Main Content Tabs */}
        
          
            
              
              Overview
            
            
              
              Activity
            
            
              
              AI Insights
            
            
              
              Emails
            
            
              
              Scores
            
            
              
              Documents
            
          

          {/* Overview Tab */}
          
            
              {/* Contact Information */}
              {contact && (
                
                  
                    
                      
                      Contact Information
                    
                  
                  
                    
                      
                        {getInitials(`${contact.firstName} ${contact.lastName}`)}
                      
                      
                        {contact.firstName} {contact.lastName}
                        {contact.jobTitle}
                      
                       setLocation(`/contacts/${contact.id}`)}
                        data-testid="button-view-contact"
                      >
                        
                      
                    
                    
                    
                      {contact.email && (
                        
                          
                          
                            {contact.email}
                          
                        
                      )}
                      {contact.directPhone && (
                        
                          
                          
                            {contact.directPhone}
                          
                        
                      )}
                      {contact.mobilePhone && (
                        
                          
                          
                            {contact.mobilePhone} (Mobile)
                          
                        
                      )}
                      {contact.linkedinUrl && (
                        
                          
                          
                            LinkedIn Profile
                          
                        
                      )}
                      {(contact.city || contact.state || contact.country) && (
                        
                          
                          
                            {[contact.city, contact.state, contact.country].filter(Boolean).join(", ")}
                          
                        
                      )}
                    
                    {(contact.department || contact.seniorityLevel) && (
                      <>
                        
                        
                          {contact.department && (
                            
                              Department
                              {contact.department}
                            
                          )}
                          {contact.seniorityLevel && (
                            
                              Seniority
                              {contact.seniorityLevel}
                            
                          )}
                        
                      
                    )}
                  
                
              )}

              {/* Account Information */}
              {account && (
                
                  
                    
                      
                      Account Information
                    
                  
                  
                    
                      
                        {getInitials(account.name)}
                      
                      
                        {account.name}
                        {account.domain && (
                          {account.domain}
                        )}
                      
                       setLocation(`/accounts/${account.id}`)}
                        data-testid="button-view-account"
                      >
                        
                      
                    
                    
                    
                      {account.industryStandardized && (
                        
                          
                          {account.industryStandardized}
                        
                      )}
                      {account.employeesSizeRange && (
                        
                          
                          {account.employeesSizeRange} employees
                        
                      )}
                      {account.revenueRange && (
                        
                          
                          {account.revenueRange} revenue
                        
                      )}
                      {(account.hqCity || account.hqState || account.hqCountry) && (
                        
                          
                          
                            {[account.hqCity, account.hqState, account.hqCountry].filter(Boolean).join(", ")}
                          
                        
                      )}
                      {account.mainPhone && (
                        
                          
                          
                            {account.mainPhone}
                          
                        
                      )}
                      {account.companyLinkedinUrl && (
                        
                          
                          
                            Company LinkedIn
                          
                        
                      )}
                    
                    {account.description && (
                      <>
                        
                        
                          Description
                          {account.description}
                        
                      
                    )}
                    {account.techStack && account.techStack.length > 0 && (
                      <>
                        
                        
                          Tech Stack
                          
                            {account.techStack.map((tech, idx) => (
                              
                                {tech}
                              
                            ))}
                          
                        
                      
                    )}
                  
                
              )}
            

            {/* Deal Details */}
            
              
                
                  
                  Deal Details
                
              
              
                
                  
                    Stage
                    {opportunity.stage}
                  
                  
                    Forecast Category
                    {opportunity.forecastCategory}
                  
                  {opportunity.leadSource && (
                    
                      Lead Source
                      {opportunity.leadSource}
                    
                  )}
                  {opportunity.contractType && (
                    
                      Contract Type
                      {opportunity.contractType}
                    
                  )}
                
                {opportunity.reason && (
                  <>
                    
                    
                      Notes
                      {opportunity.reason}
                    
                  
                )}
              
            
          

          {/* Activity Timeline Tab */}
          
            
          

          {/* AI Insights Tab */}
          
            
          

          {/* Email Conversations Tab */}
          
            
          

          {/* Score History Tab */}
          
            
          

          {/* Documents Tab */}
          
            
              
                
                  
                  Documents & Attachments
                
                
                  Proposals, contracts, and shared files
                
              
              
                
                  
                  Document storage coming soon
                  Upload and manage opportunity-related files
                
              
            
          
        
      
    
  );
}