import React, { useEffect, useState } from "react";
import {
  Bot,
  Keyboard,
  Search,
  Phone,
  Mail,
  Shield,
  ShieldCheck,
  Database,
  Code,
  CheckCircle2,
  Sparkles,
  Zap,
  Target,
  Building2,
  ArrowRight,
  Crown,
  Eye,
  ChevronRight,
  Star,
  Flame,
  X,
  BrainCircuit,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useAgentPanelContextOptional } from "@/components/agent-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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
    description: 'Advanced conversational AI capable of conducting human-like voice calls for qualification, scheduling, and follow-ups with  a.category)));

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

export default function AgenticCRMOperatorPage() {
  const agentPanel = useAgentPanelContextOptional();
  const [selectedAgent, setSelectedAgent] = useState(null);

  useEffect(() => {
    agentPanel?.openPanel();
  }, [agentPanel]);

  return (
    

      {/* ═══ COUNCIL HEADER ═══ */}
      
        {/* Decorative elements */}
        
        
        

        
          
            
              
            
            
              Agentic Operations
            
          

          
            Meet the autonomous AI workforce that powers your revenue operations. Each council member brings specialized expertise to conquer different fronts of demand generation.
          

          {/* Council stats bar */}
          
            
              
              {AGENT_CATALOG.length} Agents Online
            
            
              
              {categories.length} Divisions
            
          

          {/* AgentX quick actions */}
          
             agentPanel?.openPanel()}
              disabled={!agentPanel}
            >
              
              Open AgentX Panel
            
            
              
              Toggle with Ctrl+/
            
          
        
      

      {/* ═══ AGENT DETAIL MODAL ═══ */}
      {selectedAgent && (
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
                  
                
              

              {/* Status footer */}
              
                
                  
                  Active & Ready
                
                
                  Council Member
                
              
            
          
        
      )}

      {/* ═══ COUNCIL DIVISIONS ═══ */}
      
        {categories.map((category) => {
          const CategoryIcon = categoryIcons[category] || Bot;
          return (
            
              {/* Division Header */}
              
                
                  
                  {category} Division
                
                
                
                  {categoryDescriptions[category]}
                
              

              {/* Agent Council Cards */}
              
                {AGENT_CATALOG.filter(a => a.category === category).map((agent) => (
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
                        
                      

                      {/* View Details CTA */}
                      
                         { e.stopPropagation(); setSelectedAgent(agent); }}
                        >
                          View Council Profile
                          
                        
                      
                    
                  
                ))}
              
            
          );
        })}
      
    
  );
}