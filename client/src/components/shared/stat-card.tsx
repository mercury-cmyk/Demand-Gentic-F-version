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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000, duration: 0.4 }}
      className={className}
    >
      <Card 
        data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, '-')}`} 
        className={cn("stat-card overflow-hidden relative bg-card/80 border border-border/60", className)}
      >
        <div className={cn("absolute top-0 right-0 h-full w-28 bg-gradient-to-l opacity-50", gradient)}></div>
        <div className={cn("absolute top-0 left-0 w-1 h-full opacity-85", accentClassName)}></div>
        
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 relative z-10">
          <CardTitle className="text-sm font-medium text-foreground/70 stat-label">
            {title}
          </CardTitle>
          <div className={cn(
            "h-11 w-11 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-300",
            accentClassName
          )}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </CardHeader>
        <CardContent className="relative z-10 pb-5">
          <div className="flex items-baseline gap-2">
              <div className="text-3xl lg:text-4xl font-bold tracking-tight stat-value" data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
              {value}
            </div>
            {trend && (
              <div className={cn(
                "flex items-center gap-0.5 text-sm font-semibold px-2 py-0.5 rounded-full",
                trend.isPositive ? "bg-chart-2/10 text-chart-2" : "bg-destructive/10 text-destructive"
              )}>
                {trend.isPositive ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                <span>{Math.abs(trend.value)}%</span>
              </div>
            )}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
              {description}
            </p>
          )}
          {trend && (
            <p className="text-xs text-muted-foreground mt-1.5">
              vs last month
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
