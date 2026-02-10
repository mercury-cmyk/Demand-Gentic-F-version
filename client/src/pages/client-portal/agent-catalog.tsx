import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Mail,
  ShieldCheck,
  Database,
  Search,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Sparkles,
  Zap,
  Phone,
  Target,
  Building2,
  ArrowRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { ClientPortalLayout } from '@/components/client-portal/layout/client-portal-layout';
import { useClientOrgIntelligence, type OrganizationIntelligence } from '@/hooks/use-client-org-intelligence';

// Agent definition
interface AgentTypeDefinition {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
  expertise: string[];
  category: 'Communication' | 'Operations' | 'Intelligence';
  capabilities: string[];
  color: string;
}

const AGENT_CATALOG: AgentTypeDefinition[] = [
  {
    id: 'voice',
    title: 'Voice Agent',
    icon: Phone,
    category: 'Communication',
    color: 'text-blue-500',
    description: 'Advanced conversational AI capable of conducting human-like voice calls for qualification, scheduling, and follow-ups with <500ms latency.',
    expertise: [
      'BANT Verification',
      'Appointment Setting',
      'Objection Handling',
      'Multi-turn Conversation'
    ],
    capabilities: [
      'Sentiment Analysis',
      'Real-time Transcription',
      'Context Preservation',
      'Live Transfer'
    ]
  },
  {
    id: 'email',
    title: 'Email Outreach Agent',
    icon: Mail,
    category: 'Communication',
    color: 'text-indigo-500',
    description: 'Personalized email sequence manager that crafts, sends, and replies to emails to nurture leads at scale.',
    expertise: [
      'Cold Outreach',
      'Follow-up Sequences',
      'Inbox Management',
      'Personalization'
    ],
    capabilities: [
      'Contextual Replies',
      'A/B Testing',
      'Spam Avoidance',
      'Smart Scheduling'
    ]
  },
  {
    id: 'research_analysis',
    title: 'Research Analyst',
    icon: Search,
    category: 'Intelligence',
    color: 'text-purple-500',
    description: 'Deep-dive researcher that gathers account intelligence, market trends, and prospect signals to fuel your campaigns.',
    expertise: [
      'Account Profiling',
      'Market Trends',
      'Competitor Analysis',
      'Buying Signals'
    ],
    capabilities: [
      'Web Scraping',
      'News Monitoring',
      'Social Signals',
      'Data Synthesis'
    ]
  },
  {
    id: 'compliance',
    title: 'Compliance Guardian',
    icon: ShieldCheck,
    category: 'Operations',
    color: 'text-emerald-500',
    description: 'Ensures all communications adhere to regulatory standards (TCPA, GDPR) and maintain brand safety.',
    expertise: [
      'Regulatory Compliance',
      'DNC Management',
      'Script Adherence',
      'Risk Mitigation'
    ],
    capabilities: [
      'Real-time Monitoring',
      'Auto-Termination',
      'Audit Logging',
      'Policy Enforcement'
    ]
  },
  {
    id: 'data_management',
    title: 'Data Architect',
    icon: Database,
    category: 'Operations',
    color: 'text-orange-500',
    description: 'Manages CRM data hygiene, enrichment, and segmentation to ensure high-quality lead targeting.',
    expertise: [
      'Data Enrichment',
      'Duplicate Detection',
      'Segmentation',
      'CRM Sync'
    ],
    capabilities: [
      'Bulk Processing',
      'Data Validation',
      'API Integration',
      'Automated Updates'
    ]
  }
];

// Safely coerce a value that should be a string[] but may come back as a string or other type
function ensureStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

// Safely coerce a value that should be an object[] (e.g. personas) but may come back as a non-array
function ensureObjectArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val;
  return [];
}

function getAgentPersonalization(agentId: string, org: OrganizationIntelligence): string[] {
  const bullets: (string | undefined)[] = [];

  switch (agentId) {
    case 'voice': {
      const industries = ensureStringArray(org.icp?.industries).slice(0, 3).join(', ');
      if (industries) bullets.push(`Calls prospects in ${industries} on behalf of ${org.name}`);
      const opener = ensureStringArray(org.outreach?.callOpeners)[0];
      if (opener) bullets.push(`Opens with: "${opener.length > 80 ? opener.substring(0, 80) + '...' : opener}"`);
      const objection = ensureStringArray(org.icp?.objections)[0];
      if (objection) bullets.push(`Handles objections like: "${objection}"`);
      const personas = ensureObjectArray<{title?: string}>(org.icp?.personas).map(p => p.title).filter(Boolean).join(', ');
      if (personas && org.icp?.companySize) bullets.push(`Qualifies ${personas} at ${org.icp.companySize} companies`);
      else if (personas) bullets.push(`Qualifies ${personas}`);
      if (org.positioning?.oneLiner) bullets.push(`Pitches: "${org.positioning.oneLiner}"`);
      break;
    }
    case 'email': {
      const products = ensureStringArray(org.offerings?.coreProducts).slice(0, 3).join(', ');
      if (products) bullets.push(`Crafts emails about ${products}`);
      const angle = ensureStringArray(org.outreach?.emailAngles)[0];
      if (angle) bullets.push(`Uses angle: "${angle.length > 80 ? angle.substring(0, 80) + '...' : angle}"`);
      const personas = ensureObjectArray<{title?: string}>(org.icp?.personas).map(p => p.title).filter(Boolean).join(', ');
      const industries = ensureStringArray(org.icp?.industries).slice(0, 3).join(', ');
      if (personas && industries) bullets.push(`Targets ${personas} in ${industries}`);
      else if (personas) bullets.push(`Targets ${personas}`);
      if (org.positioning?.oneLiner) bullets.push(`Positions you as: "${org.positioning.oneLiner}"`);
      const problems = ensureStringArray(org.offerings?.problemsSolved).slice(0, 2).join(', ');
      if (problems) bullets.push(`Addresses pain points: ${problems}`);
      break;
    }
    case 'research_analysis': {
      const industries = ensureStringArray(org.icp?.industries).join(', ');
      if (industries) bullets.push(`Researches accounts in ${industries}`);
      const competitors = ensureStringArray(org.positioning?.competitors).join(', ');
      if (competitors) bullets.push(`Tracks competitors: ${competitors}`);
      const products = ensureStringArray(org.offerings?.coreProducts).slice(0, 3).join(', ');
      if (products) bullets.push(`Identifies buying signals for ${products}`);
      const regions = ensureStringArray(org.identity?.regions).join(', ');
      if (org.icp?.companySize && regions) bullets.push(`Monitors ${org.icp.companySize} companies in ${regions}`);
      else if (org.icp?.companySize) bullets.push(`Monitors ${org.icp.companySize} companies`);
      break;
    }
    case 'compliance': {
      const industry = org.identity?.industry || org.industry;
      if (industry) bullets.push(`Enforces compliance for ${industry} industry standards`);
      const productCount = ensureStringArray(org.offerings?.coreProducts).length;
      if (productCount) bullets.push(`Monitors script adherence across ${productCount} product line${productCount > 1 ? 's' : ''}`);
      const industries = ensureStringArray(org.icp?.industries).slice(0, 3).join(', ');
      if (industries) bullets.push(`Screens communications targeting ${industries}`);
      if (org.positioning?.oneLiner) bullets.push(`Ensures messaging aligns with: "${org.positioning.oneLiner}"`);
      break;
    }
    case 'data_management': {
      const personas = ensureObjectArray<{title?: string}>(org.icp?.personas).map(p => p.title).filter(Boolean).join(', ');
      if (personas) bullets.push(`Enriches contacts matching ${personas}`);
      const industries = ensureStringArray(org.icp?.industries).join(', ');
      if (industries) bullets.push(`Segments by ${industries}`);
      if (org.icp?.companySize) bullets.push(`Validates against ${org.icp.companySize} company criteria`);
      const products = ensureStringArray(org.offerings?.coreProducts).slice(0, 3).join(', ');
      if (products) bullets.push(`Syncs data for ${products} campaigns`);
      const regions = ensureStringArray(org.identity?.regions).join(', ');
      if (regions) bullets.push(`Deduplicates across ${regions} regions`);
      break;
    }
  }

  return bullets.filter((b): b is string => !!b).slice(0, 5);
}

function getIntelligenceCompleteness(org: OrganizationIntelligence): { score: number; missing: string[] } {
  const missing: string[] = [];
  let score = 0;

  if (org.identity?.description || org.identity?.industry) score++;
  else missing.push('Identity');

  if (ensureStringArray(org.offerings?.coreProducts).length > 0) score++;
  else missing.push('Offerings');

  if ((ensureStringArray(org.icp?.industries).length > 0) || (ensureObjectArray(org.icp?.personas).length > 0)) score++;
  else missing.push('ICP & Market');

  if (org.positioning?.oneLiner || org.positioning?.valueProposition) score++;
  else missing.push('Positioning');

  if ((org.outreach?.callOpeners && org.outreach.callOpeners.length > 0) || (org.outreach?.emailAngles && org.outreach.emailAngles.length > 0)) score++;
  else missing.push('Outreach');

  return { score, missing };
}

export function AgentCatalogPage() {
  const [, navigate] = useLocation();
  const { data: orgData, isLoading } = useClientOrgIntelligence();
  const org = orgData?.organization ?? null;
  const hasIntelligence = orgData?.hasIntelligence ?? false;
  const categories = Array.from(new Set(AGENT_CATALOG.map(a => a.category)));
  const completeness = org && hasIntelligence ? getIntelligenceCompleteness(org) : null;

  return (
    <ClientPortalLayout>
      <div className="space-y-8 p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col space-y-2">
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <Bot className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">AI Agent Catalog</h1>
            {org && hasIntelligence && (
              <Badge variant="secondary" className="gap-1.5 ml-2 bg-primary/10 text-primary border-primary/20">
                <Sparkles className="h-3 w-3" />
                Personalized for {org.name}
              </Badge>
            )}
            {isLoading && (
              <div className="flex items-center gap-1.5 ml-2 text-muted-foreground text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Loading context...</span>
              </div>
            )}
          </div>
          <p className="text-muted-foreground text-lg max-w-3xl">
            {hasIntelligence
              ? `Each agent below is configured with your organization's intelligence to serve ${org?.identity?.industry || org?.industry || 'your industry'} effectively.`
              : 'Explore our specialized AI workforce. Each agent is designed with specific expertise to handle different aspects of your revenue operations autonomously.'
            }
          </p>
        </div>

        {/* Missing Org Intel Banner */}
        {!isLoading && !hasIntelligence && (
          <Card className="border-dashed border-2 border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col sm:flex-row items-center gap-4 p-6">
              <div className="bg-primary/10 p-3 rounded-full shrink-0">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1 text-center sm:text-left space-y-1">
                <h3 className="text-lg font-semibold">Unlock Personalized AI Agents</h3>
                <p className="text-sm text-muted-foreground">
                  Set up your Organization Intelligence profile to see how each agent can serve your specific business, industry, and target market.
                </p>
              </div>
              <Button className="gap-2 shrink-0" onClick={() => navigate('/client-portal/dashboard?tab=intelligence')}>
                <Sparkles className="h-4 w-4" />
                Set Up Profile
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Agent Grid */}
        <div className="grid gap-8">
          {categories.map((category) => (
            <div key={category} className="space-y-4">
              <div className="flex items-center space-x-2">
                <Badge variant="outline" className="text-base px-3 py-1 font-medium bg-muted/50">
                  {category}
                </Badge>
                <Separator className="flex-1" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {AGENT_CATALOG.filter(a => a.category === category).map((agent) => {
                  const personalization = org && hasIntelligence ? getAgentPersonalization(agent.id, org) : [];

                  return (
                    <Card key={agent.id} className="group hover:shadow-md transition-all duration-200 border-muted/60 bg-card/50 backdrop-blur-sm">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className={`p-3 rounded-lg bg-muted/30 ${agent.color}`}>
                            <agent.icon className="h-6 w-6" />
                          </div>
                          <Badge variant="secondary" className="font-normal opacity-0 group-hover:opacity-100 transition-opacity">
                            Active
                          </Badge>
                        </div>
                        <CardTitle className="mt-4 text-xl">{agent.title}</CardTitle>
                        <CardDescription className="line-clamp-2 min-h-[40px]">
                          {agent.description}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="space-y-6">
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold flex items-center text-foreground">
                            <BrainCircuit className="h-4 w-4 mr-2 text-primary" />
                            Core Expertise
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {agent.expertise.map((skill) => (
                              <Badge key={skill} variant="secondary" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold flex items-center text-foreground">
                            <Zap className="h-4 w-4 mr-2 text-primary" />
                            Capabilities
                          </h4>
                          <ul className="space-y-1.5">
                            {agent.capabilities.map((cap) => (
                              <li key={cap} className="text-sm text-muted-foreground flex items-center">
                                <CheckCircle2 className="h-3 w-3 mr-2 text-green-500" />
                                {cap}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Personalized "For Your Business" Section */}
                        {personalization.length > 0 && (
                          <div className="space-y-3 pt-2 border-t border-dashed border-primary/20">
                            <h4 className="text-sm font-semibold flex items-center text-primary">
                              <Target className="h-4 w-4 mr-2" />
                              For Your Business
                            </h4>
                            <ul className="space-y-1.5">
                              {personalization.map((bullet, idx) => (
                                <li key={idx} className="text-sm text-muted-foreground flex items-start">
                                  <Sparkles className="h-3 w-3 mr-2 mt-0.5 text-primary/60 shrink-0" />
                                  <span>{bullet}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Incomplete Intelligence Prompt */}
        {completeness && completeness.score < 5 && (
          <Alert className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm">
              <span className="font-medium">Enhance your agent personalization</span> — your intelligence profile is {Math.round((completeness.score / 5) * 100)}% complete. Add {completeness.missing.join(', ')} for better targeting.{' '}
              <span className="text-primary underline cursor-pointer" onClick={() => navigate('/client-portal/dashboard?tab=intelligence')}>Complete your profile</span>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ClientPortalLayout>
  );
}

export default AgentCatalogPage;
