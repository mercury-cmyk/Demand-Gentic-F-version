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
  sparklineData?: Array<{ value: number }>;
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
    
    const actualTrend = trend || (change! > 0 ? "up" : change! < 0 ? "down" : "neutral");
    
    switch (actualTrend) {
      case "up":
        return <TrendingUp className="h-4 w-4" />;
      case "down":
        return <TrendingDown className="h-4 w-4" />;
      default:
        return <Minus className="h-4 w-4" />;
    }
  };

  const getTrendColor = () => {
    if (change === undefined && !trend) return "text-muted-foreground";
    
    const actualTrend = trend || (change! > 0 ? "up" : change! < 0 ? "down" : "neutral");
    
    switch (actualTrend) {
      case "up":
        return "text-success";
      case "down":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <Card className={cn("", className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {Icon && (
            <div className="h-4 w-4 text-muted-foreground">
              <Icon className="h-full w-full" />
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-8 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("hover-elevate transition-all", className)} data-testid="kpi-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && (
          <div className="h-4 w-4 text-muted-foreground">
            <Icon className="h-full w-full" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="text-2xl font-bold" data-testid="kpi-value">
            {value}
          </div>
          {(change !== undefined || changeLabel) && (
            <div className="flex items-center gap-1 mt-1 text-xs">
              <span className={cn("flex items-center gap-1 font-medium", getTrendColor())}>
                {getTrendIcon()}
                {change !== undefined && `${change > 0 ? "+" : ""}${change}%`}
              </span>
              <span className="text-muted-foreground">{changeLabel}</span>
            </div>
          )}
          {sparklineData && sparklineData.length > 0 && (
            <div className="mt-3 h-12">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparklineData}>
                  <defs>
                    <linearGradient id="kpiGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#kpiGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>
      </CardContent>
    </Card>
  );
}

// Trend Chart Component
export interface TrendChartProps {
  title: string;
  data: Array<{ label: string; value: number; [key: string]: any }>;
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
        <div className="rounded-lg border bg-background p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col">
              <span className="text-[0.70rem] uppercase text-muted-foreground">
                {payload[0].payload.label}
              </span>
              <span className="font-bold text-foreground">
                {valueFormatter(payload[0].value as number)}
              </span>
            </div>
          </div>
        </div>
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
        <BarChart data={data}>
          <XAxis
            dataKey="label"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={valueFormatter}
          />
          <Tooltip content={tooltipContent} />
          <Bar {...commonProps} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      );
    }

    if (type === "area") {
      return (
        <AreaChart data={data}>
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={valueFormatter}
          />
          <Tooltip content={tooltipContent} />
          <Area type="monotone" {...commonProps} fill="url(#chartGradient)" />
        </AreaChart>
      );
    }

    return (
      <LineChart data={data}>
        <XAxis
          dataKey="label"
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={valueFormatter}
        />
        <Tooltip content={tooltipContent} />
        <Line type="monotone" {...commonProps} />
      </LineChart>
    );
  };

  return (
    <Card className={cn("", className)} data-testid="trend-chart">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          {renderChart()}
        </ResponsiveContainer>
      </CardContent>
    </Card>
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
    <Card className={cn("", className)} data-testid="leaderboard">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {displayItems.map((item, index) => {
          const percentage = (item.value / maxValue) * 100;
          const isTop3 = index < 3;

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="relative"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0",
                    isTop3
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {index + 1}
                </div>
                {item.avatar && (
                  <img
                    src={item.avatar}
                    alt={item.name}
                    className="w-8 h-8 rounded-full flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  {item.subtitle && (
                    <p className="text-xs text-muted-foreground truncate">
                      {item.subtitle}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.change !== undefined && (
                    <span
                      className={cn(
                        "flex items-center gap-0.5 text-xs font-medium",
                        item.change > 0
                          ? "text-success"
                          : item.change < 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {item.change > 0 ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : item.change < 0 ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : null}
                      {item.change !== 0 && `${Math.abs(item.change)}%`}
                    </span>
                  )}
                  <span className="text-sm font-bold">
                    {valueFormatter(item.value)}
                  </span>
                </div>
              </div>
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    isTop3 ? "bg-primary" : "bg-muted-foreground"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                />
              </div>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
