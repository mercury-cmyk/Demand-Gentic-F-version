/**
 * Intelligence Studio Dashboard
 *
 * Central hub for AI & Intelligence configuration.
 * Shows configuration hierarchy, quick stats, and navigation to all AI features.
 */

import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  Brain,
  Bot,
  Phone,
  ArrowRight,
  ChevronRight,
  Layers,
  MessageSquare,
  Zap,
  Settings,
  Play,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardStats {
  organizations: number;
  campaigns: number;
  virtualAgents: number;
  knowledgeBlocks: number;
}

export default function IntelligenceStudioDashboard() {
  const { token } = useAuth();

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/ai-studio/stats'],
    queryFn: async () => {
      // Fetch counts from various endpoints
      const [orgsRes, campaignsRes, agentsRes] = await Promise.all([
        fetch('/api/organization-intelligence', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/campaigns?type=call', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/virtual-agents', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const orgs = orgsRes.ok ? await orgsRes.json() : [];
      const campaigns = campaignsRes.ok ? await campaignsRes.json() : [];
      const agents = agentsRes.ok ? await agentsRes.json() : [];

      return {
        organizations: Array.isArray(orgs) ? orgs.length : 0,
        campaigns: Array.isArray(campaigns) ? campaigns.length : 0,
        virtualAgents: Array.isArray(agents) ? agents.length : 0,
        knowledgeBlocks: 0, // Will be populated when knowledge blocks API is available
      };
    },
    enabled: !!token,
  });

  const configurationSteps = [
    {
      step: 1,
      title: 'Organization Intelligence',
      description: 'Define your company profile, services, and messaging framework',
      icon: Building2,
      href: '/ai-studio/intelligence',
      color: 'bg-blue-500',
    },
    {
      step: 2,
      title: 'Virtual Agents',
      description: 'Create and configure AI voice agents with personalities',
      icon: Bot,
      href: '/ai-studio/agents',
      color: 'bg-purple-500',
    },
    {
      step: 3,
      title: 'Campaign Configuration',
      description: 'Bind intelligence and agents to campaigns',
      icon: Phone,
      href: '/ai-studio/campaign-intelligence',
      color: 'bg-green-500',
    },
    {
      step: 4,
      title: 'Preview & Test',
      description: 'Test agent behavior in Preview Studio',
      icon: Play,
      href: '/preview-studio',
      color: 'bg-amber-500',
    },
  ];

  const quickActions = [
    {
      title: 'Organization Intelligence',
      description: 'Configure company profile and messaging',
      icon: Brain,
      href: '/ai-studio/intelligence',
      badge: stats?.organizations ? `${stats.organizations} orgs` : null,
    },
    {
      title: 'Virtual Agents',
      description: 'Manage AI voice agents',
      icon: Bot,
      href: '/ai-studio/agents',
      badge: stats?.virtualAgents ? `${stats.virtualAgents} agents` : null,
    },
    {
      title: 'Preview Studio',
      description: 'Test and simulate conversations',
      icon: MessageSquare,
      href: '/preview-studio',
      badge: null,
    },
    {
      title: 'Campaign Bindings',
      description: 'Connect intelligence to campaigns',
      icon: Layers,
      href: '/ai-studio/campaign-intelligence',
      badge: stats?.campaigns ? `${stats.campaigns} campaigns` : null,
    },
  ];

  return (
    
      {/* Header */}
      
        Intelligence Studio
        
          Configure and manage your AI intelligence layer - from organization knowledge to voice
          agents
        
      

      {/* Stats Overview */}
      
        
          
            Organizations
            
          
          
            {statsLoading ? (
              
            ) : (
              {stats?.organizations || 0}
            )}
            Intelligence profiles
          
        
        
          
            Virtual Agents
            
          
          
            {statsLoading ? (
              
            ) : (
              {stats?.virtualAgents || 0}
            )}
            AI voice agents
          
        
        
          
            Campaigns
            
          
          
            {statsLoading ? (
              
            ) : (
              {stats?.campaigns || 0}
            )}
            Phone campaigns
          
        
        
          
            Knowledge Blocks
            
          
          
            {statsLoading ? (
              
            ) : (
              {stats?.knowledgeBlocks || 0}
            )}
            Reusable content
          
        
      

      {/* Configuration Flow */}
      
        
          
            
            Configuration Flow
          
          
            Follow this recommended sequence to set up your AI intelligence
          
        
        
          
            {configurationSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                
                  
                    
                      
                        
                      
                      
                        Step {step.step}
                      
                      {step.title}
                      {step.description}
                    
                    {index 
                        
                      
                    )}
                  
                
              );
            })}
          
        
      

      {/* Quick Actions */}
      
        Quick Actions
        
          {quickActions.map(action => {
            const Icon = action.icon;
            return (
              
                
                  
                    
                      
                        
                          
                        
                        
                          {action.title}
                          {action.badge && (
                            
                              {action.badge}
                            
                          )}
                        
                      
                      
                    
                  
                  
                    {action.description}
                  
                
              
            );
          })}
        
      

      {/* Configuration Hierarchy Visualization */}
      
        
          
            
            Configuration Hierarchy
          
          
            How intelligence flows from organization level to individual conversations
          
        
        
          
            {/* Hierarchy visualization */}
            
              {/* Level 1: Organization */}
              
                System Level
                
                  
                    
                    Organization Intelligence
                  
                  
                    Company profile, services, messaging framework, ICP definitions
                  
                
              

              {/* Connector */}
              
                
                
                  
                
              

              {/* Level 2: Virtual Agents */}
              
                Agent Level
                
                  
                    
                    Virtual Agents
                  
                  
                    Agent personality, voice settings, conversation style, knowledge blocks
                  
                
              

              {/* Connector */}
              
                
                
                  
                
              

              {/* Level 3: Campaign */}
              
                Campaign Level
                
                  
                    
                    Campaign Configuration
                  
                  
                    Campaign-specific overrides, target audience context, call objectives
                  
                
              

              {/* Connector */}
              
                
                
                  
                
              

              {/* Level 4: Conversation */}
              
                Runtime
                
                  
                    
                    Live Conversation
                  
                  
                    Contact-specific context, real-time adaptation, dynamic responses
                  
                
              
            
          
        
      
    
  );
}