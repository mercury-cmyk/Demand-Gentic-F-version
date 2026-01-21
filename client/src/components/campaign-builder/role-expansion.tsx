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
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "border rounded-lg p-3 transition-all cursor-pointer hover:shadow-sm",
        isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      )}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        <Checkbox 
          checked={isSelected} 
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5"
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{suggestion.title}</span>
            <Badge variant="outline" className={cn("text-[10px]", getRelevanceColor(suggestion.relevanceScore))}>
              {Math.round(suggestion.relevanceScore * 100)}% match
            </Badge>
          </div>
          
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {suggestion.reason}
          </p>
          
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="mt-2 pt-2 border-t space-y-2"
            >
              <div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Buying Responsibility</span>
                <p className="text-xs">{suggestion.buyingResponsibility}</p>
              </div>
              <div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Organizational Pain</span>
                <p className="text-xs">{suggestion.organizationalPain}</p>
              </div>
            </motion.div>
          )}
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-[10px] text-primary hover:underline mt-1 flex items-center gap-1"
          >
            {expanded ? (
              <>Less details <ChevronDown className="h-3 w-3" /></>
            ) : (
              <>More details <ChevronRight className="h-3 w-3" /></>
            )}
          </button>
        </div>
      </div>
    </motion.div>
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
  const [expandedRoles, setExpandedRoles] = useState<ExpandedRole[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(initialSelected));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(specifiedRoles));

  // Expand roles mutation
  const expandMutation = useMutation<RoleExpansionResponse, Error, void>({
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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <UserPlus className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Intelligent Role Expansion</CardTitle>
              <CardDescription className="text-xs">
                AI-suggested job titles based on your target audience
              </CardDescription>
            </div>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => expandMutation.mutate()}
            disabled={expandMutation.isPending || specifiedRoles.length === 0}
          >
            {expandMutation.isPending ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 mr-1" />
                Expand Roles
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Original roles */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Specified Roles</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {specifiedRoles.map((role) => (
              <Badge key={role} variant="secondary" className="gap-1">
                <Briefcase className="h-3 w-3" />
                {role}
              </Badge>
            ))}
          </div>
        </div>

        {specifiedRoles.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Add some job titles first to get AI suggestions</p>
          </div>
        )}

        {/* Industry/Context info */}
        {industries.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            <span>Targeting: {industries.slice(0, 3).join(', ')}{industries.length > 3 ? ` +${industries.length - 3} more` : ''}</span>
          </div>
        )}

        <Separator />

        {/* Expanded roles */}
        {expandedRoles.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                AI Suggestions ({totalSuggestions})
              </span>
              <span className="text-xs text-muted-foreground">
                {selectedRoles.size} selected
              </span>
            </div>

            <ScrollArea className="max-h-[400px]">
              <div className="space-y-4">
                {expandedRoles.map((expandedRole) => (
                  <div key={expandedRole.originalRole} className="space-y-2">
                    <button
                      onClick={() => toggleGroup(expandedRole.originalRole)}
                      className="flex items-center gap-2 w-full text-left"
                    >
                      {expandedGroups.has(expandedRole.originalRole) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="text-sm font-medium">{expandedRole.originalRole}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {expandedRole.suggestions.length} suggestions
                      </Badge>
                    </button>

                    <AnimatePresence>
                      {expandedGroups.has(expandedRole.originalRole) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="pl-6 space-y-2"
                        >
                          {/* Quick actions */}
                          <div className="flex gap-2 text-[10px]">
                            <button
                              onClick={() => selectAllForRole(expandedRole.originalRole, expandedRole.suggestions)}
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              <Check className="h-3 w-3" /> Select all
                            </button>
                            <button
                              onClick={() => deselectAllForRole(expandedRole.originalRole, expandedRole.suggestions)}
                              className="text-muted-foreground hover:underline flex items-center gap-1"
                            >
                              <X className="h-3 w-3" /> Clear
                            </button>
                          </div>

                          {/* Suggestions */}
                          {expandedRole.suggestions.map((suggestion) => (
                            <RoleSuggestionCard
                              key={suggestion.title}
                              suggestion={suggestion}
                              isSelected={selectedRoles.has(suggestion.title)}
                              onToggle={() => toggleRole(suggestion.title)}
                            />
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Info tooltip */}
        <div className="flex items-start gap-2 p-3 bg-blue-500/10 rounded-lg text-xs">
          <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-blue-700">
            <p className="font-medium">How Role Expansion Works</p>
            <p className="mt-1 text-blue-600">
              Our AI analyzes your campaign context and identifies related job titles based on:
              organizational responsibilities, buying authority, common pain points, and 
              equivalent titles across industries.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default RoleExpansion;
