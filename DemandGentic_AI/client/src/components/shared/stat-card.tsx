import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  description?: string;
  delay?: number;
  gradient?: string;
  accentClassName?: string;
  className?: string;
}

export function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  description, 
  delay = 0,
  gradient = "from-primary/15 via-primary/5 to-transparent",
  accentClassName = "bg-gradient-primary",
  className
}: StatCardProps) {
  return (
    
      
        
        
        
        
          
            {title}
          
          
            
          
        
        
          
              
              {value}
            
            {trend && (
              
                {trend.isPositive ? (
                  
                ) : (
                  
                )}
                {Math.abs(trend.value)}%
              
            )}
          
          {description && (
            
              {description}
            
          )}
          {trend && (
            
              vs last month
            
          )}
        
      
    
  );
}