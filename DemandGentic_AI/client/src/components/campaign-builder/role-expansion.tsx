/**
 * Role Expansion Component
 * 
 * AI-powered role/title expansion that suggests additional relevant
 * job titles based on campaign context and organizational pain points.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { RoleExpansionResponse } from '@shared/campaign-context-types';
import {
  Sparkles,
  Users,
  UserPlus,
  ChevronRight,
  ChevronDown,
  Loader2,
  Info,
  Target,
  Briefcase,
  Building2,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface RoleSuggestion {
  title: string;
  relevanceScore: number;
  reason: string;
  buyingResponsibility?: string;
  organizationalPain?: string;
}

interface ExpandedRole {
  originalRole: string;
  suggestions: RoleSuggestion[];
}

interface RoleExpansionProps {
  specifiedRoles: string[];
  industries: string[];
  companySize?: { min: number; max: number };
  campaignContext?: any;
  onRolesSelected: (roles: string[]) => void;
  selectedRoles?: string[];
}

// ============================================================
// ROLE SUGGESTION CARD
// ============================================================

interface RoleSuggestionCardProps {
  suggestion: RoleSuggestion;
  isSelected: boolean;
  onToggle: () => void;
}

function RoleSuggestionCard({ suggestion, isSelected, onToggle }: RoleSuggestionCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  // Color based on relevance
  const getRelevanceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-500/10';
    if (score >= 0.6) return 'text-blue-600 bg-blue-500/10';
    if (score >= 0.4) return 'text-yellow-600 bg-yellow-500/10';
    return 'text-gray-600 bg-gray-500/10';
  };

  return (
    
      
         e.stopPropagation()}
          className="mt-0.5"
        />
        
        
          
            {suggestion.title}
            
              {Math.round(suggestion.relevanceScore * 100)}% match
            
          
          
          
            {suggestion.reason}
          
          
          {expanded && (
            
              
                Buying Responsibility
                {suggestion.buyingResponsibility}
              
              
                Organizational Pain
                {suggestion.organizationalPain}
              
            
          )}
          
           {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-[10px] text-primary hover:underline mt-1 flex items-center gap-1"
          >
            {expanded ? (
              <>Less details 
            ) : (
              <>More details 
            )}
          
        
      
    
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function RoleExpansion({
  specifiedRoles,
  industries,
  companySize,
  campaignContext,
  onRolesSelected,
  selectedRoles: initialSelected = [],
}: RoleExpansionProps) {
  const { toast } = useToast();
  const [expandedRoles, setExpandedRoles] = useState([]);
  const [selectedRoles, setSelectedRoles] = useState>(new Set(initialSelected));
  const [expandedGroups, setExpandedGroups] = useState>(new Set(specifiedRoles));

  // Expand roles mutation
  const expandMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/campaign-context/expand-roles', {
        specifiedRoles,
        industries,
        companySize,
        campaignContext,
      });
      const data: RoleExpansionResponse = await res.json();
      return data;
    },
    onSuccess: (data) => {
      setExpandedRoles(data.expandedRoles || []);
      toast({
        title: 'Roles Expanded',
        description: `Found ${data.totalSuggestions} additional role suggestions`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Expansion Failed',
        description: 'Could not expand roles. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const toggleRole = (role: string) => {
    setSelectedRoles(prev => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      onRolesSelected(Array.from(next));
      return next;
    });
  };

  const toggleGroup = (originalRole: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(originalRole)) {
        next.delete(originalRole);
      } else {
        next.add(originalRole);
      }
      return next;
    });
  };

  const selectAllForRole = (originalRole: string, suggestions: RoleSuggestion[]) => {
    setSelectedRoles(prev => {
      const next = new Set(prev);
      suggestions.forEach(s => next.add(s.title));
      onRolesSelected(Array.from(next));
      return next;
    });
  };

  const deselectAllForRole = (originalRole: string, suggestions: RoleSuggestion[]) => {
    setSelectedRoles(prev => {
      const next = new Set(prev);
      suggestions.forEach(s => next.delete(s.title));
      onRolesSelected(Array.from(next));
      return next;
    });
  };

  const totalSuggestions = expandedRoles.reduce((acc, r) => acc + r.suggestions.length, 0);

  return (
    
      
        
          
            
              
            
            
              Intelligent Role Expansion
              
                AI-suggested job titles based on your target audience
              
            
          
          
           expandMutation.mutate()}
            disabled={expandMutation.isPending || specifiedRoles.length === 0}
          >
            {expandMutation.isPending ? (
              <>
                
                Analyzing...
              
            ) : (
              <>
                
                Expand Roles
              
            )}
          
        
      

      
        {/* Original roles */}
        
          
            
            Specified Roles
          
          
            {specifiedRoles.map((role) => (
              
                
                {role}
              
            ))}
          
        

        {specifiedRoles.length === 0 && (
          
            
            Add some job titles first to get AI suggestions
          
        )}

        {/* Industry/Context info */}
        {industries.length > 0 && (
          
            
            Targeting: {industries.slice(0, 3).join(', ')}{industries.length > 3 ? ` +${industries.length - 3} more` : ''}
          
        )}

        

        {/* Expanded roles */}
        {expandedRoles.length > 0 && (
          
            
              
                AI Suggestions ({totalSuggestions})
              
              
                {selectedRoles.size} selected
              
            

            
              
                {expandedRoles.map((expandedRole) => (
                  
                     toggleGroup(expandedRole.originalRole)}
                      className="flex items-center gap-2 w-full text-left"
                    >
                      {expandedGroups.has(expandedRole.originalRole) ? (
                        
                      ) : (
                        
                      )}
                      {expandedRole.originalRole}
                      
                        {expandedRole.suggestions.length} suggestions
                      
                    

                    
                      {expandedGroups.has(expandedRole.originalRole) && (
                        
                          {/* Quick actions */}
                          
                             selectAllForRole(expandedRole.originalRole, expandedRole.suggestions)}
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                               Select all
                            
                             deselectAllForRole(expandedRole.originalRole, expandedRole.suggestions)}
                              className="text-muted-foreground hover:underline flex items-center gap-1"
                            >
                               Clear
                            
                          

                          {/* Suggestions */}
                          {expandedRole.suggestions.map((suggestion) => (
                             toggleRole(suggestion.title)}
                            />
                          ))}
                        
                      )}
                    
                  
                ))}
              
            
          
        )}

        {/* Info tooltip */}
        
          
          
            How Role Expansion Works
            
              Our AI analyzes your campaign context and identifies related job titles based on:
              organizational responsibilities, buying authority, common pain points, and 
              equivalent titles across industries.
            
          
        
      
    
  );
}

export default RoleExpansion;