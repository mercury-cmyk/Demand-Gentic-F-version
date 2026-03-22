import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUp,
  ArrowDown,
  LucideIcon
} from "lucide-react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// KPI Card Component
export interface KpiCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  sparklineData?: Array;
  className?: string;
  loading?: boolean;
}

export function KpiCard({
  title,
  value,
  change,
  changeLabel = "vs last period",
  icon: Icon,
  trend,
  sparklineData,
  className,
  loading = false,
}: KpiCardProps) {
  const getTrendIcon = () => {
    if (change === undefined && !trend) return null;
    
    const actualTrend = trend || (change! > 0 ? "up" : change! ;
      case "down":
        return ;
      default:
        return ;
    }
  };

  const getTrendColor = () => {
    if (change === undefined && !trend) return "text-muted-foreground";
    
    const actualTrend = trend || (change! > 0 ? "up" : change! 
        
          
            {title}
          
          {Icon && (
            
              
            
          )}
        
        
          
            
            
          
        
      
    );
  }

  return (
    
      
        
          {title}
        
        {Icon && (
          
            
          
        )}
      
      
        
          
            {value}
          
          {(change !== undefined || changeLabel) && (
            
              
                {getTrendIcon()}
                {change !== undefined && `${change > 0 ? "+" : ""}${change}%`}
              
              {changeLabel}
            
          )}
          {sparklineData && sparklineData.length > 0 && (
            
              
                
                  
                    
                      
                      
                    
                  
                  
                
              
            
          )}
        
      
    
  );
}

// Trend Chart Component
export interface TrendChartProps {
  title: string;
  data: Array;
  dataKey?: string;
  type?: "line" | "bar" | "area";
  height?: number;
  valueFormatter?: (value: number) => string;
  className?: string;
}

export function TrendChart({
  title,
  data,
  dataKey = "value",
  type = "line",
  height = 300,
  valueFormatter = (value) => value.toString(),
  className,
}: TrendChartProps) {
  const tooltipContent = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        
          
            
              
                {payload[0].payload.label}
              
              
                {valueFormatter(payload[0].value as number)}
              
            
          
        
      );
    }
    return null;
  };

  const renderChart = () => {
    const commonProps = {
      dataKey,
      stroke: "hsl(var(--primary))",
      strokeWidth: 2,
    };

    if (type === "bar") {
      return (
        
          
          
          
          
        
      );
    }

    if (type === "area") {
      return (
        
          
            
              
              
            
          
          
          
          
          
        
      );
    }

    return (
      
        
        
        
        
      
    );
  };

  return (
    
      
        {title}
      
      
        
          {renderChart()}
        
      
    
  );
}

// Leaderboard Component
export interface LeaderboardItem {
  id: string;
  name: string;
  value: number;
  change?: number;
  avatar?: string;
  subtitle?: string;
}

export interface LeaderboardProps {
  title: string;
  items: LeaderboardItem[];
  valueFormatter?: (value: number) => string;
  maxItems?: number;
  className?: string;
}

export function Leaderboard({
  title,
  items,
  valueFormatter = (value) => value.toString(),
  maxItems = 5,
  className,
}: LeaderboardProps) {
  const displayItems = items.slice(0, maxItems);
  const maxValue = Math.max(...displayItems.map((item) => item.value));

  return (
    
      
        {title}
      
      
        {displayItems.map((item, index) => {
          const percentage = (item.value / maxValue) * 100;
          const isTop3 = index 
              
                
                  {index + 1}
                
                {item.avatar && (
                  
                )}
                
                  {item.name}
                  {item.subtitle && (
                    
                      {item.subtitle}
                    
                  )}
                
                
                  {item.change !== undefined && (
                     0
                          ? "text-success"
                          : item.change 
                      {item.change > 0 ? (
                        
                      ) : item.change 
                      ) : null}
                      {item.change !== 0 && `${Math.abs(item.change)}%`}
                    
                  )}
                  
                    {valueFormatter(item.value)}
                  
                
              
              
                
              
            
          );
        })}
      
    
  );
}