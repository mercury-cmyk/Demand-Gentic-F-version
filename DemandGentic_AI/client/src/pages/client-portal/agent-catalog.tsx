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
  Code,
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
    description: 'Advanced conversational AI capable of conducting human-like voice calls for qualification, scheduling, and follow-ups with  s.trim()).filter(Boolean);
  return [];
}

// Safely coerce a value that should be an object[] (e.g. personas) but may come back as a non-array
function ensureObjectArray(val: unknown): T[] {
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
      const personas = ensureObjectArray(org.icp?.personas).map(p => p.title).filter(Boolean).join(', ');
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
      const personas = ensureObjectArray(org.icp?.personas).map(p => p.title).filter(Boolean).join(', ');
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
      const personas = ensureObjectArray(org.icp?.personas).map(p => p.title).filter(Boolean).join(', ');
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
  const [selectedAgent, setSelectedAgent] = useState(null);

  const categoryIcons: Record = {
    Communication: Phone,
    Operations: Shield,
    Intelligence: Eye,
  };

  const categoryDescriptions: Record = {
    Communication: 'Masters of outreach and dialogue — these agents forge connections across every channel.',
    Operations: 'The backbone of your revenue machine — they guard, clean, and orchestrate.',
    Intelligence: 'The all-seeing eyes — they research, analyze, and illuminate the path forward.',
  };

  return (
    
      

        {/* ═══ COUNCIL HEADER ═══ */}
        
          {/* Decorative elements */}
          
          
          

          
            
              
                
              
              
                
                  The Agentic Council
                
                {org && hasIntelligence && (
                  
                    
                    Serving {org.name}
                  
                )}
                {isLoading && (
                  
                    
                    Summoning council...
                  
                )}
              
            

            
              {hasIntelligence
                ? `Your autonomous AI council — each member is calibrated with your organization's intelligence to dominate ${org?.identity?.industry || org?.industry || 'your market'}.`
                : 'Meet the autonomous AI workforce that powers your revenue operations. Each council member brings specialized expertise to conquer different fronts of demand generation.'
              }
            

            {/* Council stats bar */}
            
              
                
                {AGENT_CATALOG.length} Agents Online
              
              
                
                {categories.length} Divisions
              
              {completeness && (
                
                  
                  Intelligence: {Math.round((completeness.score / 5) * 100)}%
                
              )}
            
          
        

        {/* ═══ MISSING ORG INTEL BANNER ═══ */}
        {!isLoading && !hasIntelligence && (
          
            
              
                
              
              
                Empower the Council
                
                  Set up your Organization Intelligence profile to unlock personalized strategies from each council member tailored to your business.
                
              
               navigate('/client-portal/dashboard?tab=intelligence')}>
                
                Activate Intelligence
                
              
            
          
        )}

        {/* ═══ AGENT DETAIL MODAL ═══ */}
        {selectedAgent && (() => {
          const personalization = org && hasIntelligence ? getAgentPersonalization(selectedAgent.id, org) : [];
          return (
             setSelectedAgent(null)}>
               e.stopPropagation()}>
                {/* Top accent gradient */}
                
                
                
                  {/* Close button */}
                   setSelectedAgent(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                    
                  

                  {/* Agent header */}
                  
                    
                      
                    
                    
                      
                        
                          
                          {selectedAgent.rank}
                        
                        
                          {selectedAgent.category}
                        
                      
                      {selectedAgent.title}
                      {selectedAgent.motto}
                    
                  

                  {/* Description */}
                  {selectedAgent.description}

                  {/* Expertise & Capabilities side by side */}
                  
                    
                      
                        
                        Core Expertise
                      
                      
                        {selectedAgent.expertise.map((skill) => (
                          
                            
                            {skill}
                          
                        ))}
                      
                    
                    
                      
                        
                        Capabilities
                      
                      
                        {selectedAgent.capabilities.map((cap) => (
                          
                            
                            {cap}
                          
                        ))}
                      
                    
                  

                  {/* Personalization */}
                  {personalization.length > 0 && (
                    
                      
                        
                        Calibrated for {org?.name}
                      
                      
                        {personalization.map((bullet, idx) => (
                          
                            
                            {bullet}
                          
                        ))}
                      
                    
                  )}

                  {/* Status footer */}
                  
                    
                      
                      Active & Ready
                    
                    
                      Council Member
                    
                  
                
              
            
          );
        })()}

        {/* ═══ COUNCIL DIVISIONS ═══ */}
        
          {categories.map((category) => {
            const CategoryIcon = categoryIcons[category] || Bot;
            return (
              
                {/* Division Header */}
                
                  
                    
                    {category} Division
                  
                  
                  
                    {categoryDescriptions[category]}
                  
                

                {/* Agent Council Cards */}
                
                  {AGENT_CATALOG.filter(a => a.category === category).map((agent) => {
                    const personalization = org && hasIntelligence ? getAgentPersonalization(agent.id, org) : [];

                    return (
                       setSelectedAgent(agent)}
                      >
                        {/* Top accent line */}
                        

                        
                          
                            
                              
                            
                            
                              
                                
                                {agent.rank}
                              
                              
                                
                                Online
                              
                            
                          
                          {agent.title}
                          {agent.motto}
                          
                            {agent.description}
                          
                        

                        
                          {/* Expertise tags */}
                          
                            
                              
                              Expertise
                            
                            
                              {agent.expertise.map((skill) => (
                                
                                  {skill}
                                
                              ))}
                            
                          

                          {/* Capability list */}
                          
                            
                              
                              Powers
                            
                            
                              {agent.capabilities.map((cap) => (
                                
                                  
                                  {cap}
                                
                              ))}
                            
                          

                          {/* Personalized section */}
                          {personalization.length > 0 && (
                            
                              
                                
                                Your Mission
                              
                              
                                {personalization.slice(0, 3).map((bullet, idx) => (
                                  
                                    
                                    {bullet}
                                  
                                ))}
                              
                            
                          )}

                          {/* View Details CTA */}
                          
                             { e.stopPropagation(); setSelectedAgent(agent); }}
                            >
                              View Council Profile
                              
                            
                          
                        
                      
                    );
                  })}
                
              
            );
          })}
        

        {/* ═══ INCOMPLETE INTELLIGENCE PROMPT ═══ */}
        {completeness && completeness.score 
            
            
              Enhance council calibration — your intelligence profile is {Math.round((completeness.score / 5) * 100)}% complete. Add {completeness.missing.join(', ')} for precision targeting.{' '}
               navigate('/client-portal/dashboard?tab=intelligence')}>Complete your profile
            
          
        )}
      
    
  );
}

export default AgentCatalogPage;