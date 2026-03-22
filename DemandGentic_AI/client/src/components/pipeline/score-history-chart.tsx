import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  BarChart3, TrendingUp, TrendingDown, Minus, Zap
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ScoreHistoryEntry {
  id: string;
  opportunityId: string;
  scoreType: 'engagement' | 'fit' | 'stage_probability';
  previousValue: number | null;
  newValue: number;
  delta: number;
  reason: string | null;
  changedBy: string | null;
  createdAt: string;
}

interface ScoreHistoryChartProps {
  opportunityId: string;
  history: ScoreHistoryEntry[];
  isLoading: boolean;
}

const getScoreTypeLabel = (type: string) => {
  switch (type) {
    case 'engagement':
      return 'Engagement Score';
    case 'fit':
      return 'Fit Score';
    case 'stage_probability':
      return 'Stage Probability';
    default:
      return type;
  }
};

const getScoreTypeColor = (type: string) => {
  switch (type) {
    case 'engagement':
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
    case 'fit':
      return 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400';
    case 'stage_probability':
      return 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400';
  }
};

const getDeltaIndicator = (delta: number) => {
  if (delta > 0) {
    return {
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      prefix: '+',
    };
  } else if (delta  {
    const date = format(new Date(entry.createdAt), 'MMM d, yyyy');
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(entry);
    return acc;
  }, {} as Record);

  const dates = Object.keys(groupedHistory).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    
      
        
          
          Score History
        
        
          Timeline of engagement, fit, and probability score changes
        
      
      
        {isLoading ? (
          
            Loading score history...
          
        ) : history.length === 0 ? (
          
            
            No score history available
            Scores will be tracked as they change over time
          
        ) : (
          
            
              {dates.map((date, dateIdx) => (
                
                  {/* Date Header */}
                  
                    
                      {date}
                    
                    
                  

                  {/* Score Changes for Date */}
                  
                    {groupedHistory[date].map((entry, entryIdx) => {
                      const deltaIndicator = getDeltaIndicator(entry.delta);
                      const DeltaIcon = deltaIndicator.icon;
                      const colorClass = getScoreTypeColor(entry.scoreType);

                      return (
                        
                          {/* Timeline Line */}
                          {dateIdx 
                          ) : null}

                          {/* Timeline Dot */}
                          
                            
                          

                          {/* Score Type Icon */}
                          
                            
                              
                            
                          

                          {/* Score Details */}
                          
                            
                              
                                
                                  
                                    {getScoreTypeLabel(entry.scoreType)}
                                  
                                   0 ? 'default' : entry.delta 
                                    
                                    {deltaIndicator.prefix}{entry.delta}
                                  
                                
                                
                                  
                                    {entry.previousValue !== null ? entry.previousValue : 'N/A'}
                                  
                                  →
                                  
                                    {entry.newValue}
                                  
                                
                              
                              
                                {format(new Date(entry.createdAt), 'h:mm a')}
                              
                            
                            {entry.reason && (
                              
                                {entry.reason}
                              
                            )}
                            {entry.changedBy && (
                              
                                Changed by: {entry.changedBy}
                              
                            )}
                          
                        
                      );
                    })}
                  
                
              ))}
            
          
        )}
      
    
  );
}