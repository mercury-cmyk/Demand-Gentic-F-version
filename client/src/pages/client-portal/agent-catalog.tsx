import React, { useState } from 'react';
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
  Crown,
  Shield,
  Eye,
  ChevronRight,
  Star,
  Flame,
  X,
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
  rank: string;
  motto: string;
  gradient: string;
  accentBorder: string;
}

const AGENT_CATALOG: AgentTypeDefinition[] = [
  {
    id: 'voice',
    title: 'Voice Agent',
    icon: Phone,
    category: 'Communication',
    color: 'text-blue-500',
    gradient: 'from-blue-600/20 via-cyan-500/10 to-transparent',
    accentBorder: 'border-blue-500/30',
    rank: 'Grand Orator',
    motto: '"Every conversation is a doorway to opportunity."',
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
    gradient: 'from-indigo-600/20 via-violet-500/10 to-transparent',
    accentBorder: 'border-indigo-500/30',
    rank: 'Scroll Weaver',
    motto: '"The right words, at the right time, to the right soul."',
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
    gradient: 'from-purple-600/20 via-fuchsia-500/10 to-transparent',
    accentBorder: 'border-purple-500/30',
    rank: 'Oracle of Insight',
    motto: '"Knowledge is the currency of conquest."',
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
    gradient: 'from-emerald-600/20 via-green-500/10 to-transparent',
    accentBorder: 'border-emerald-500/30',
    rank: 'Sentinel of Order',
    motto: '"In discipline, we find our strength."',
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
    gradient: 'from-orange-600/20 via-amber-500/10 to-transparent',
    accentBorder: 'border-orange-500/30',
    rank: 'Keeper of Records',
    motto: '"Clean data is the foundation of empire."',
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
  const [selectedAgent, setSelectedAgent] = useState<AgentTypeDefinition | null>(null);

  const categoryIcons: Record<string, React.ElementType> = {
    Communication: Phone,
    Operations: Shield,
    Intelligence: Eye,
  };

  const categoryDescriptions: Record<string, string> = {
    Communication: 'Masters of outreach and dialogue — these agents forge connections across every channel.',
    Operations: 'The backbone of your revenue machine — they guard, clean, and orchestrate.',
    Intelligence: 'The all-seeing eyes — they research, analyze, and illuminate the path forward.',
  };

  return (
    <ClientPortalLayout>
      <div className="space-y-10 p-6 md:p-8 max-w-[1600px] mx-auto">

        {/* ═══ COUNCIL HEADER ═══ */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-slate-950 via-violet-950/90 to-slate-950 p-8 md:p-12">
          {/* Decorative elements */}
          <div className="absolute inset-0 opacity-[0.04]" style={{backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px'}} />
          <div className="absolute top-0 right-0 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/25">
                <Crown className="h-7 w-7 text-white" />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
                  The Agentic Council
                </h1>
                {org && hasIntelligence && (
                  <Badge className="gap-1.5 bg-violet-500/20 text-violet-200 border-violet-400/30 backdrop-blur-sm">
                    <Sparkles className="h-3 w-3" />
                    Serving {org.name}
                  </Badge>
                )}
                {isLoading && (
                  <div className="flex items-center gap-1.5 text-violet-300/60 text-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Summoning council...</span>
                  </div>
                )}
              </div>
            </div>

            <p className="text-violet-200/70 text-lg max-w-2xl leading-relaxed">
              {hasIntelligence
                ? `Your autonomous AI council — each member is calibrated with your organization's intelligence to dominate ${org?.identity?.industry || org?.industry || 'your market'}.`
                : 'Meet the autonomous AI workforce that powers your revenue operations. Each council member brings specialized expertise to conquer different fronts of demand generation.'
              }
            </p>

            {/* Council stats bar */}
            <div className="flex items-center gap-6 mt-8 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-violet-300/80">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span>{AGENT_CATALOG.length} Agents Online</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-violet-300/80">
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                <span>{categories.length} Divisions</span>
              </div>
              {completeness && (
                <div className="flex items-center gap-2 text-sm text-violet-300/80">
                  <Star className="h-3.5 w-3.5 text-yellow-400" />
                  <span>Intelligence: {Math.round((completeness.score / 5) * 100)}%</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ MISSING ORG INTEL BANNER ═══ */}
        {!isLoading && !hasIntelligence && (
          <Card className="border-dashed border-2 border-violet-400/30 bg-gradient-to-r from-violet-500/5 via-indigo-500/5 to-transparent">
            <CardContent className="flex flex-col sm:flex-row items-center gap-4 p-6">
              <div className="bg-gradient-to-br from-violet-500/20 to-indigo-500/20 p-3 rounded-full shrink-0">
                <Building2 className="h-8 w-8 text-violet-500" />
              </div>
              <div className="flex-1 text-center sm:text-left space-y-1">
                <h3 className="text-lg font-semibold">Empower the Council</h3>
                <p className="text-sm text-muted-foreground">
                  Set up your Organization Intelligence profile to unlock personalized strategies from each council member tailored to your business.
                </p>
              </div>
              <Button className="gap-2 shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700" onClick={() => navigate('/client-portal/dashboard?tab=intelligence')}>
                <Sparkles className="h-4 w-4" />
                Activate Intelligence
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ═══ AGENT DETAIL MODAL ═══ */}
        {selectedAgent && (() => {
          const personalization = org && hasIntelligence ? getAgentPersonalization(selectedAgent.id, org) : [];
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedAgent(null)}>
              <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Top accent gradient */}
                <div className={`h-1.5 w-full bg-gradient-to-r ${selectedAgent.gradient}`} />
                
                <div className="p-8">
                  {/* Close button */}
                  <button onClick={() => setSelectedAgent(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                    <X className="h-5 w-5" />
                  </button>

                  {/* Agent header */}
                  <div className="flex items-start gap-5 mb-8">
                    <div className={`p-4 rounded-2xl bg-gradient-to-br ${selectedAgent.gradient} border ${selectedAgent.accentBorder}`}>
                      <selectedAgent.icon className={`h-10 w-10 ${selectedAgent.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-[10px] px-2 bg-amber-500/20 text-amber-300 border-amber-500/30">
                          <Crown className="h-2.5 w-2.5 mr-1" />
                          {selectedAgent.rank}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-2 text-white/50 border-white/10">
                          {selectedAgent.category}
                        </Badge>
                      </div>
                      <h2 className="text-2xl font-bold text-white mb-1">{selectedAgent.title}</h2>
                      <p className="text-sm italic text-violet-300/60">{selectedAgent.motto}</p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-white/70 leading-relaxed mb-8 text-[15px]">{selectedAgent.description}</p>

                  {/* Expertise & Capabilities side by side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold flex items-center text-white/90">
                        <BrainCircuit className="h-4 w-4 mr-2 text-violet-400" />
                        Core Expertise
                      </h4>
                      <div className="space-y-2">
                        {selectedAgent.expertise.map((skill) => (
                          <div key={skill} className="flex items-center gap-2 text-sm text-white/60 bg-white/5 rounded-lg px-3 py-2">
                            <Star className="h-3 w-3 text-amber-400 shrink-0" />
                            {skill}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold flex items-center text-white/90">
                        <Zap className="h-4 w-4 mr-2 text-cyan-400" />
                        Capabilities
                      </h4>
                      <div className="space-y-2">
                        {selectedAgent.capabilities.map((cap) => (
                          <div key={cap} className="flex items-center gap-2 text-sm text-white/60 bg-white/5 rounded-lg px-3 py-2">
                            <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                            {cap}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Personalization */}
                  {personalization.length > 0 && (
                    <div className="space-y-3 pt-6 border-t border-white/10">
                      <h4 className="text-sm font-semibold flex items-center text-violet-300">
                        <Target className="h-4 w-4 mr-2" />
                        Calibrated for {org?.name}
                      </h4>
                      <div className="space-y-2">
                        {personalization.map((bullet, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm text-white/60 bg-violet-500/5 rounded-lg px-3 py-2 border border-violet-500/10">
                            <Sparkles className="h-3 w-3 mt-0.5 text-violet-400 shrink-0" />
                            <span>{bullet}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Status footer */}
                  <div className="flex items-center justify-between mt-8 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2 text-sm text-green-400">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      Active & Ready
                    </div>
                    <Badge className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-0">
                      Council Member
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ═══ COUNCIL DIVISIONS ═══ */}
        <div className="space-y-10">
          {categories.map((category) => {
            const CategoryIcon = categoryIcons[category] || Bot;
            return (
              <div key={category} className="space-y-5">
                {/* Division Header */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 bg-muted/50 border border-border/50 rounded-xl px-4 py-2.5">
                    <CategoryIcon className="h-5 w-5 text-primary" />
                    <span className="text-base font-bold tracking-tight">{category} Division</span>
                  </div>
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground/60 italic px-2">
                    {categoryDescriptions[category]}
                  </span>
                </div>

                {/* Agent Council Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {AGENT_CATALOG.filter(a => a.category === category).map((agent) => {
                    const personalization = org && hasIntelligence ? getAgentPersonalization(agent.id, org) : [];

                    return (
                      <Card
                        key={agent.id}
                        className={`group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-violet-500/5 hover:-translate-y-1 border-muted/60 bg-card/80 backdrop-blur-sm ${agent.accentBorder} hover:border-primary/30`}
                        onClick={() => setSelectedAgent(agent)}
                      >
                        {/* Top accent line */}
                        <div className={`h-1 w-full bg-gradient-to-r ${agent.gradient} opacity-60 group-hover:opacity-100 transition-opacity`} />

                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className={`p-3 rounded-xl bg-gradient-to-br ${agent.gradient} border ${agent.accentBorder} ${agent.color} transition-transform group-hover:scale-110 duration-300`}>
                              <agent.icon className="h-6 w-6" />
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                              <Badge variant="secondary" className="text-[10px] px-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                                <Crown className="h-2.5 w-2.5 mr-1" />
                                {agent.rank}
                              </Badge>
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">Online</span>
                              </div>
                            </div>
                          </div>
                          <CardTitle className="mt-4 text-xl group-hover:text-primary transition-colors">{agent.title}</CardTitle>
                          <p className="text-xs italic text-muted-foreground/60 -mt-0.5">{agent.motto}</p>
                          <CardDescription className="line-clamp-2 mt-2 min-h-[40px]">
                            {agent.description}
                          </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-5 pb-5">
                          {/* Expertise tags */}
                          <div className="space-y-2.5">
                            <h4 className="text-xs font-semibold flex items-center text-foreground/80 uppercase tracking-wider">
                              <BrainCircuit className="h-3.5 w-3.5 mr-1.5 text-primary" />
                              Expertise
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {agent.expertise.map((skill) => (
                                <Badge key={skill} variant="secondary" className="text-[11px] font-normal bg-muted/80 hover:bg-muted transition-colors">
                                  {skill}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          {/* Capability list */}
                          <div className="space-y-2.5">
                            <h4 className="text-xs font-semibold flex items-center text-foreground/80 uppercase tracking-wider">
                              <Zap className="h-3.5 w-3.5 mr-1.5 text-primary" />
                              Powers
                            </h4>
                            <ul className="grid grid-cols-2 gap-1">
                              {agent.capabilities.map((cap) => (
                                <li key={cap} className="text-xs text-muted-foreground flex items-center">
                                  <CheckCircle2 className="h-3 w-3 mr-1.5 text-green-500 shrink-0" />
                                  {cap}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Personalized section */}
                          {personalization.length > 0 && (
                            <div className="space-y-2.5 pt-3 border-t border-dashed border-primary/20">
                              <h4 className="text-xs font-semibold flex items-center text-primary uppercase tracking-wider">
                                <Target className="h-3.5 w-3.5 mr-1.5" />
                                Your Mission
                              </h4>
                              <ul className="space-y-1">
                                {personalization.slice(0, 3).map((bullet, idx) => (
                                  <li key={idx} className="text-xs text-muted-foreground flex items-start">
                                    <Sparkles className="h-3 w-3 mr-1.5 mt-0.5 text-primary/60 shrink-0" />
                                    <span className="line-clamp-1">{bullet}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* View Details CTA */}
                          <div className="pt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full gap-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-primary/5 text-primary"
                              onClick={(e) => { e.stopPropagation(); setSelectedAgent(agent); }}
                            >
                              View Council Profile
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══ INCOMPLETE INTELLIGENCE PROMPT ═══ */}
        {completeness && completeness.score < 5 && (
          <Alert className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm">
              <span className="font-medium">Enhance council calibration</span> — your intelligence profile is {Math.round((completeness.score / 5) * 100)}% complete. Add {completeness.missing.join(', ')} for precision targeting.{' '}
              <span className="text-primary underline cursor-pointer" onClick={() => navigate('/client-portal/dashboard?tab=intelligence')}>Complete your profile</span>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ClientPortalLayout>
  );
}

export default AgentCatalogPage;
