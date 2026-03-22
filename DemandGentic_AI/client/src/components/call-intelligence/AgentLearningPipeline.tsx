import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Info, CheckCircle2, TrendingUp, AlertCircle } from 'lucide-react';
import { QualityIssue, QualityRecommendation } from './types';
import { cn } from '@/lib/utils';

interface AgentLearningPipelineProps {
  issues?: QualityIssue[];
  recommendations?: QualityRecommendation[];
  className?: string;
}

export function AgentLearningPipeline({
  issues = [],
  recommendations = [],
  className,
}: AgentLearningPipelineProps) {
  const highPriorityIssues = issues.filter((i) => i.severity === 'high');
  const mediumPriorityIssues = issues.filter((i) => i.severity === 'medium');
  const lowPriorityIssues = issues.filter((i) => i.severity === 'low');

  return (
    
      
        
           
            
            Agent Learning Pipeline
          
          
            Actionable insights and coaching moments derived from this conversation.
          
        
      

      
        {/* High Priority - Critical Coaching */}
        
          
            
              
              Critical Issues
              
                {highPriorityIssues.length}
              
            
          
          
            
              {highPriorityIssues.length > 0 ? (
                
                  {highPriorityIssues.map((issue, idx) => (
                    
                      {issue.type}
                      {issue.description}
                      {issue.recommendation && (
                        
                          Coach: {issue.recommendation}
                        
                      )}
                    
                  ))}
                
              ) : (
                
                   
                   No critical issues found
                
              )}
            
          
        

        {/* Medium Priority - Improvements */}
        
          
            
              
              Improvements
              
                {mediumPriorityIssues.length}
              
            
          
          
            
            {mediumPriorityIssues.length > 0 ? (
                
                  {mediumPriorityIssues.map((issue, idx) => (
                    
                      {issue.type}
                      {issue.description}
                      {issue.recommendation && (
                         
                          Tip: {issue.recommendation}
                        
                      )}
                    
                  ))}
                
              ) : (
                
                   No improvement areas identified
                
              )}
            
          
        

        {/* Low Priority / Recommendations - Fine Tuning */}
        
          
            
              
              Refinement & Tips
              
                {lowPriorityIssues.length + recommendations.length}
              
            
          
          
            
             {(lowPriorityIssues.length > 0 || recommendations.length > 0) ? (
                
                  {lowPriorityIssues.map((issue, idx) => (
                    
                      {issue.type}
                      {issue.description}
                    
                  ))}
                   {recommendations.map((rec, idx) => (
                    
                      
                         {rec.category}
                      
                      {rec.suggestedChange}
                    
                  ))}
                
              ) : (
                
                   No refinement needed
                
              )}
            
          
        
      
    
  );
}