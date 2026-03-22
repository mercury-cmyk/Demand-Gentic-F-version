import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import type { SegmentAnalysis } from "./types";
import { TIER_COLORS, SCORE_DIMENSIONS } from "./types";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface Props {
  data: SegmentAnalysis;
}

export function SegmentAnalysisPanel({ data }: Props) {
  const [expandedTier, setExpandedTier] = useState(null);

  return (
    
      {/* Tier Overview Cards */}
      
        {data.tiers.map((tier) => {
          const color = TIER_COLORS[tier.name] || "#6b7280";
          return (
             setExpandedTier(expandedTier === tier.name ? null : tier.name)}
            >
              
                
                  {tier.name}
                  {expandedTier === tier.name ? (
                    
                  ) : (
                    
                  )}
                
                Range: {tier.range}
                {tier.count}
                Avg: {tier.avgScore}
              
            
          );
        })}
      

      {/* Expanded Tier Detail */}
      {expandedTier && (() => {
        const tier = data.tiers.find(t => t.name === expandedTier);
        if (!tier) return null;
        const color = TIER_COLORS[tier.name] || "#6b7280";

        const radarData = SCORE_DIMENSIONS.map(dim => ({
          dimension: dim.label,
          value: tier.avgBreakdown[dim.key] || 0,
          fullMark: 200,
        }));

        return (
          
            
              
                {tier.name} Detail — {tier.count} contacts (avg {tier.avgScore})
              
            
            
              
                {/* Radar Chart */}
                
                  
                    Avg Sub-Score Profile
                  
                  
                    
                      
                      
                      
                      
                    
                  
                

                {/* Industry Breakdown */}
                
                  
                    Top Industries
                  
                  
                    {tier.industryBreakdown.slice(0, 8).map((ind) => (
                      
                        {ind.industry}
                        
                          
                            {ind.count}
                          
                          
                            {ind.avgScore}
                          
                        
                      
                    ))}
                    {tier.industryBreakdown.length === 0 && (
                      No data
                    )}
                  
                

                {/* Role Breakdown */}
                
                  
                    Top Roles
                  
                  
                    {tier.roleBreakdown.slice(0, 8).map((role) => (
                      
                        {role.role}
                        
                          
                            {role.count}
                          
                          
                            {role.avgScore}
                          
                        
                      
                    ))}
                    {tier.roleBreakdown.length === 0 && (
                      No data
                    )}
                  
                
              
            
          
        );
      })()}

      {!expandedTier && (
        
          Click a tier card above to see detailed breakdown
        
      )}
    
  );
}