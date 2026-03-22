/**
 * Quality Analysis Panel Component
 *
 * Displays conversation quality analysis with score, subscores,
 * and actionable recommendations.
 *
 * This reuses the quality analysis pattern from the existing
 * QualityMetricsPanel but with the unified data model.
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Target,
  TrendingUp,
  ChevronDown,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UnifiedQualityAnalysis, QualityRecommendation } from './types';
import { getQualityScoreColor } from './types';

interface QualityAnalysisPanelProps {
  analysis: UnifiedQualityAnalysis;
  className?: string;
}

export function QualityAnalysisPanel({
  analysis,
  className,
}: QualityAnalysisPanelProps) {
  const hasSubscores = Object.keys(analysis.subscores).length > 0;
  const hasRecommendations = analysis.recommendations.length > 0;

  return (
    
      {/* Overall Score Card */}
      
        
          
            
            Quality Score
          
        
        
          
            {/* Score Circle */}
            
              {analysis.score ?? '--'}
            

            {/* Sentiment & Engagement */}
            
              {analysis.sentiment && (
                
                  Sentiment:
                  
                    {analysis.sentiment}
                  
                
              )}
              {analysis.engagementLevel && (
                
                  Engagement:
                  
                    {analysis.engagementLevel}
                  
                
              )}
            
          
        
      

      {/* Subscores */}
      {hasSubscores && (
        
          
            
              
                
                  
                  Quality Dimensions
                
                
              
            
            
              
                
                  {Object.entries(analysis.subscores).map(([key, value]) => (
                    
                  ))}
                
              
            
          
        
      )}

      {/* Recommendations */}
      {hasRecommendations && (
        
          
            
              
              Recommendations ({analysis.recommendations.length})
            
          
          
            
              {analysis.recommendations.map((rec, idx) => (
                
              ))}
            
          
        
      )}
    
  );
}

// ============================================
// Sub-components
// ============================================

function SubscoreItem({ name, value }: { name: string; value: number | undefined }) {
  const formattedName = name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase());

  const score = value ?? 0;
  const color = score >= 70 ? 'bg-green-500' :
                score >= 50 ? 'bg-yellow-500' :
                'bg-red-500';

  return (
    
      
        {formattedName}
        {score}/100
      
      {/* Custom progress bar with dynamic color */}
      
        
      
    
  );
}

function RecommendationItem({ recommendation }: { recommendation: QualityRecommendation }) {
  const priorityColors: Record = {
    high: 'border-red-300 bg-red-50 text-red-700',
    medium: 'border-yellow-300 bg-yellow-50 text-yellow-700',
    low: 'border-gray-300 bg-gray-50 text-gray-700',
  };

  return (
    
      
        {recommendation.category && (
          
            {recommendation.category}
          
        )}
        {recommendation.priority && (
          
            {recommendation.priority}
          
        )}
      
      
        {recommendation.suggestedChange || recommendation.text}
      
      {recommendation.impact && (
        
          Impact: {recommendation.impact}
        
      )}
    
  );
}