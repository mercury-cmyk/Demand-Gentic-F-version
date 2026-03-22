import { useQuery } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Brain, 
  Target, 
  Users, 
  Activity, 
  ArrowRight,
  ShieldCheck,
  Zap,
  Info,
  ChevronRight,
  Plus
} from "lucide-react";
import type { Account } from "@shared/schema";
import type { AccountStrategy, BuyingCommitteeMember } from "@shared/schema_addition";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ROUTE_PATHS } from "@/lib/route-paths";

interface AccountIntelligenceWorkspaceProps {
  account: Account;
}

export function AccountIntelligenceWorkspace({ account }: AccountIntelligenceWorkspaceProps) {
  const [, setLocation] = useLocation();
  const { data: strategy } = useQuery({
    queryKey: [`/api/intelligence/accounts/${account.id}/strategy`],
  });

  const { data: committee } = useQuery({
    queryKey: [`/api/intelligence/accounts/${account.id}/committee`],
  });

  const roles = committee || [];
  const hasStrategy = !!strategy;

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'economic_buyer': return ;
      case 'champion': return ;
      case 'technical_evaluator': return ;
      default: return ;
    }
  };

  return (
    
      {/* Account Context Banner */}
      
        
          
        
        
          
            
              Tier 1 Priority
              High ICP Match
            
            {account.name}
            
              {account.description?.slice(0, 150)}...
            
          
          
             
                Signal Strength
                
                   
                      
                   
                   Strong
                
             
          
        
      

      
        
          {/* Strategy Section */}
          
            
              
                
                  
                    
                    Strategic Directive
                  
                  Engagement Approach
                
                {hasStrategy && (
                   Approved
                )}
              
            
            
              {hasStrategy ? (
                
                  
                    
                      Objective
                      {strategy.engagementObjective || 'Activate Priority Account'}
                    
                    
                      Entry Point
                      
                        
                           {strategy.messagingAngle || 'Problem-led'}
                        
                      
                    
                  
                  
                  
                    "This account shows strong indicators of tech-debt in their current CX stack. Focus messaging on the 'efficiency gap' and use Case Study A as the primary proof-point for the initial email sequence."
                  

                  
                    
                      Email
                      AI Follow-up
                    
                    
                      Modify Strategy
                    
                  
                
              ) : (
                
                  
                    
                  
                  
                    Generate Account Strategy
                    
                      Let the Organizational Brain analyze this account's committee and signals to propose a unique path forward.
                    
                    
                      Run AI Strategy Engine
                    
                  
                
              )}
            
          

          {/* Buying Committee */}
          
            
              
                
                Buying Committee
              
              
                 Map Role
              
            
            
            
              {[
                { role: 'economic_buyer', label: 'Economic Buyer', status: 'mapped', name: 'Sarah Thompson' },
                { role: 'champion', label: 'Champion', status: 'mapped', name: 'Mark Wilson' },
                { role: 'technical_evaluator', label: 'Technical Evaluator', status: 'missing', name: null },
                { role: 'influencer', label: 'Influencer', status: 'mapped', name: 'David Chen' },
              ].map((item) => (
                
                  
                    
                      
                        {getRoleIcon(item.role)}
                      
                      
                        {item.label}
                        
                          {item.name || 'Role Missing'}
                        
                      
                    
                    {item.status === 'missing' ? (
                      
                         
                      
                    ) : (
                      Verified
                    )}
                  
                
              ))}
            
          
        

        
          {/* Next Best Action Rail */}
          
            
              
                
                Execution Hub
              
              Next Best Action
            
            
              
                
                   Identify Technical Evaluator
                   
                      Your buying committee is 75% complete. Identifying the technical lead will unlock the "High-Touch Technical" strategy variant.
                   
                
              
               setLocation(ROUTE_PATHS.emailCampaignCreate)}
              >
                Launch Engagement
                
              
            
          

          {/* Quick Metrics */}
          
             Engagement Signal
             
                
                   
                      
                         Open Rate
                         42%
                      
                      +12% vs Industry
                   
                   
                      
                   
                
             
          
        
      
    
  );
}