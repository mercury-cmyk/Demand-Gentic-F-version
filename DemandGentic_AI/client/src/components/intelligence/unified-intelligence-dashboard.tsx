/**
 * Unified Intelligence Dashboard Component
 * Beautiful, interactive dashboard showcasing:
 * - Conversations
 * - Disposition Intelligence
 * - Call Recordings
 * - Reports
 * - Showcase Calls
 * - Reanalysis
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MessageSquare,
  Brain,
  Mic,
  BarChart3,
  Star,
  RefreshCw,
  ArrowRight,
  Play,
  TrendingUp,
  Zap,
  Eye,
  Clock,
  Users,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface UnifiedIntelligenceStats {
  conversations: {
    total: number;
    active: number;
    avgDuration: string;
    sentiment: {
      positive: number;
      neutral: number;
      negative: number;
    };
  };
  dispositions: {
    qualified: number;
    notInterested: number;
    needsReview: number;
    qualified_leads: number;
  };
  recordings: {
    total: number;
    analyzed: number;
    pending: number;
    avgQuality: number;
  };
  reports: {
    generated: number;
    pending: number;
    accuracy: number;
  };
  showcaseCalls: {
    best: number;
    training: number;
    quality: number;
  };
  reanalysis: {
    pending: number;
    inProgress: number;
    completed: number;
  };
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

interface StatBoxProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: number;
  color?: string;
}

function StatBox({ label, value, icon, trend, color = "blue" }: StatBoxProps) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };

  return (
    
      
        
          
            {label}
            {value}
            {trend !== undefined && (
              
                
                {trend > 0 ? "+" : ""}{trend}% this week
              
            )}
          
          {icon}
        
      
    
  );
}

interface SectionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  stats: Array;
  actionLabel?: string;
  actionUrl?: string;
  color?: string;
}

function SectionCard({
  icon,
  title,
  description,
  stats,
  actionLabel = "View Details",
  actionUrl = "#",
  color = "blue",
}: SectionCardProps) {
  return (
    
      
        
          
            
              
                {icon}
              
              
                {title}
                {description}
              
            
          
        
        
          
            {stats.map((stat, idx) => (
              
                {stat.label}
                {stat.value}
              
            ))}
          
          
            
              {actionLabel}
              
            
          
        
      
    
  );
}

export function UnifiedIntelligenceDashboard() {
  const [selectedTab, setSelectedTab] = useState("overview");

  const {
    data: intelligenceData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["/api/intelligence/unified-stats"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      
        
        
          {Array(6)
            .fill(0)
            .map((_, i) => (
              
            ))}
        
      
    );
  }

  if (isError) {
    return (
      
        
          
            
            Unified Intelligence Unavailable
          
          
            {error?.message || "Failed to load unified intelligence statistics."}
          
        
        
           void refetch()}>
            
            Retry
          
        
      
    );
  }

  const stats = intelligenceData || {
    conversations: { total: 0, active: 0, avgDuration: "0s", sentiment: { positive: 0, neutral: 0, negative: 0 } },
    dispositions: { qualified: 0, notInterested: 0, needsReview: 0, qualified_leads: 0 },
    recordings: { total: 0, analyzed: 0, pending: 0, avgQuality: 0 },
    reports: { generated: 0, pending: 0, accuracy: 0 },
    showcaseCalls: { best: 0, training: 0, quality: 0 },
    reanalysis: { pending: 0, inProgress: 0, completed: 0 },
  };

  return (
    
      {/* Header */}
      
        
          
          Unified Intelligence Hub
        
        
          Complete conversation analytics, disposition intelligence, and call insights powered by AI
        
      

      {/* Tabs */}
      
        
          
            
            Overview
          
          
            
            Conversations
          
          
            
            Dispositions
          
          
            
            Recordings
          
          
            
            Reports
          
          
            
            Showcase
          
        

        {/* Overview Tab */}
        
          
            }
              trend={12}
              color="blue"
            />
            }
              color="green"
            />
            }
              trend={8}
              color="green"
            />
            }
              color="purple"
            />
            }
              color="amber"
            />
            }
              color="rose"
            />
          

          
            }
              title="Conversations"
              description="Real-time call analytics and sentiment tracking"
              stats={[
                { label: "Total", value: stats.conversations.total },
                { label: "Avg Duration", value: stats.conversations.avgDuration },
                { label: "Positive", value: `${stats.conversations.sentiment.positive}%` },
                { label: "Negative", value: `${stats.conversations.sentiment.negative}%` },
              ]}
              actionLabel="View Conversations"
              actionUrl="/disposition-intelligence?tab=conversation-quality"
              color="blue"
            />

            }
              title="Disposition Intelligence"
              description="AI-powered call classification and outcomes"
              stats={[
                { label: "Qualified", value: stats.dispositions.qualified },
                { label: "Not Interested", value: stats.dispositions.notInterested },
                { label: "Needs Review", value: stats.dispositions.needsReview },
                { label: "Leads Created", value: stats.dispositions.qualified_leads },
              ]}
              actionLabel="View Dispositions"
              actionUrl="/disposition-intelligence?tab=disposition-intelligence"
              color="purple"
            />

            }
              title="Call Recordings"
              description="Stored and analyzed call recordings with quality scoring"
              stats={[
                { label: "Total", value: stats.recordings.total },
                { label: "Analyzed", value: stats.recordings.analyzed },
                { label: "Pending", value: stats.recordings.pending },
                { label: "Avg Quality", value: `${stats.recordings.avgQuality}%` },
              ]}
              actionLabel="Browse Recordings"
              actionUrl="/disposition-intelligence?tab=conversation-quality"
              color="blue"
            />

            }
              title="Reports & Analytics"
              description="Comprehensive campaign and performance reports"
              stats={[
                { label: "Generated", value: stats.reports.generated },
                { label: "Pending", value: stats.reports.pending },
                { label: "Accuracy", value: `${stats.reports.accuracy}%` },
                { label: "Updated", value: "Today" },
              ]}
              actionLabel="View Reports"
              actionUrl="/reports"
              color="amber"
            />

            }
              title="Showcase Calls"
              description="Best performing calls for training and quality reference"
              stats={[
                { label: "Best", value: stats.showcaseCalls.best },
                { label: "Training", value: stats.showcaseCalls.training },
                { label: "Quality Score", value: `${stats.showcaseCalls.quality}%` },
                { label: "This Month", value: "Updated" },
              ]}
              actionLabel="Watch Showcase"
              actionUrl="/disposition-intelligence?tab=showcase-calls"
              color="rose"
            />

            }
              title="Reanalysis Engine"
              description="Re-analyze calls with updated AI models and insights"
              stats={[
                { label: "Pending", value: stats.reanalysis.pending },
                { label: "In Progress", value: stats.reanalysis.inProgress },
                { label: "Completed", value: stats.reanalysis.completed },
                { label: "Queue", value: "Active" },
              ]}
              actionLabel="Manage Queue"
              actionUrl="/disposition-intelligence?tab=reanalysis"
              color="purple"
            />
          
        

        {/* Conversations Tab */}
        
          
            
              
                Conversation Analytics
                
                  Real-time analysis of all conversations with sentiment tracking and engagement metrics
                
              
              
                
                  
                    Total Conversations
                    {stats.conversations.total}
                  
                  
                    Currently Active
                    {stats.conversations.active}
                  
                  
                    Avg Duration
                    {stats.conversations.avgDuration}
                  
                  
                    Positive Sentiment
                    {stats.conversations.sentiment.positive}%
                  
                
                
                  
                    
                    View All Conversations
                  
                
              
            
          
        

        {/* Dispositions Tab */}
        
          
            
              
                Disposition Intelligence
                
                  AI-powered call classification with real-time disposition tracking and lead creation
                
              
              
                
                  
                    Qualified Leads
                    {stats.dispositions.qualified_leads}
                  
                  
                    Not Interested
                    {stats.dispositions.notInterested}
                  
                  
                    Needs Review
                    {stats.dispositions.needsReview}
                  
                  
                    Total Classified
                    
                      {stats.dispositions.qualified + stats.dispositions.notInterested + stats.dispositions.needsReview}
                    
                  
                
                
                  
                    
                    View Disposition Details
                  
                
              
            
          
        

        {/* Recordings Tab */}
        
          
            
              
                Call Recordings
                
                  Stored call recordings with quality scoring and analysis
                
              
              
                
                  
                    Total Recordings
                    {stats.recordings.total}
                  
                  
                    Analyzed
                    {stats.recordings.analyzed}
                  
                  
                    Pending Analysis
                    {stats.recordings.pending}
                  
                  
                    Avg Quality
                    {stats.recordings.avgQuality}%
                  
                
                
                  
                    
                    Browse Call Recordings
                  
                
              
            
          
        

        {/* Reports Tab */}
        
          
            
              
                Reports & Analytics
                
                  Comprehensive performance reports and analytics dashboards
                
              
              
                
                  
                    Generated Reports
                    {stats.reports.generated}
                  
                  
                    Pending Reports
                    {stats.reports.pending}
                  
                  
                    Report Accuracy
                    {stats.reports.accuracy}%
                  
                  
                    This Period
                    Active
                  
                
                
                  
                    
                    View All Reports
                  
                
              
            
          
        

        {/* Showcase Tab */}
        
          
            
              
                Showcase Calls
                
                  Best performing calls for training, coaching, and quality reference
                
              
              
                
                  
                    Best Calls
                    {stats.showcaseCalls.best}
                  
                  
                    Training Materials
                    {stats.showcaseCalls.training}
                  
                  
                    Quality Score
                    {stats.showcaseCalls.quality}%
                  
                  
                    Updated
                    Today
                  
                
                
                  
                    
                    Watch Showcase Calls
                  
                
              
            
          
        
      

      {/* Quick Actions */}
      
        
          
            
            Conversations
          
        
        
          
            
            Dispositions
          
        
        
          
            
            Recordings
          
        
        
          
            
            Reports
          
        
      
    
  );
}

export default UnifiedIntelligenceDashboard;