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
    <motion.div variants={itemVariants}>
      <div className={cn("rounded-lg border p-4", colorClasses[color as keyof typeof colorClasses])}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium opacity-75">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {trend !== undefined && (
              <div className="flex items-center gap-1 mt-2 text-xs font-semibold">
                <TrendingUp className="h-3 w-3" />
                <span>{trend > 0 ? "+" : ""}{trend}% this week</span>
              </div>
            )}
          </div>
          <div className="text-2xl opacity-50">{icon}</div>
        </div>
      </div>
    </motion.div>
  );
}

interface SectionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  stats: Array<{ label: string; value: string | number }>;
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
    <motion.div variants={itemVariants}>
      <Card className="hover:shadow-lg transition-all duration-300 overflow-hidden h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "p-2 rounded-lg text-white",
                  color === "blue" && "bg-blue-500",
                  color === "green" && "bg-green-500",
                  color === "purple" && "bg-purple-500",
                  color === "amber" && "bg-amber-500",
                  color === "rose" && "bg-rose-500"
                )}
              >
                {icon}
              </div>
              <div>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription className="text-xs mt-1">{description}</CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat, idx) => (
              <div key={idx} className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-bold">{stat.value}</p>
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full" asChild>
            <a href={actionUrl}>
              {actionLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
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
  } = useQuery<UnifiedIntelligenceStats, Error>({
    queryKey: ["/api/intelligence/unified-stats"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-2 gap-4">
          {Array(6)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Unified Intelligence Unavailable
          </CardTitle>
          <CardDescription>
            {error?.message || "Failed to load unified intelligence statistics."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
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
    <motion.div className="space-y-8" variants={containerVariants} initial="hidden" animate="visible">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-3xl font-bold flex items-center gap-2">
          <Zap className="h-8 w-8 text-amber-500" />
          Unified Intelligence Hub
        </h2>
        <p className="text-muted-foreground">
          Complete conversation analytics, disposition intelligence, and call insights powered by AI
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6 lg:grid-cols-6">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="conversations" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Conversations</span>
          </TabsTrigger>
          <TabsTrigger value="dispositions" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Dispositions</span>
          </TabsTrigger>
          <TabsTrigger value="recordings" className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            <span className="hidden sm:inline">Recordings</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Reports</span>
          </TabsTrigger>
          <TabsTrigger value="showcase" className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            <span className="hidden sm:inline">Showcase</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatBox
              label="Conversations"
              value={stats.conversations.total}
              icon={<MessageSquare className="h-5 w-5" />}
              trend={12}
              color="blue"
            />
            <StatBox
              label="Active Now"
              value={stats.conversations.active}
              icon={<Users className="h-5 w-5" />}
              color="green"
            />
            <StatBox
              label="Qualified Leads"
              value={stats.dispositions.qualified_leads}
              icon={<CheckCircle className="h-5 w-5" />}
              trend={8}
              color="green"
            />
            <StatBox
              label="Recordings"
              value={stats.recordings.total}
              icon={<Mic className="h-5 w-5" />}
              color="purple"
            />
            <StatBox
              label="Reports"
              value={stats.reports.generated}
              icon={<BarChart3 className="h-5 w-5" />}
              color="amber"
            />
            <StatBox
              label="Reanalysis"
              value={stats.reanalysis.completed}
              icon={<RefreshCw className="h-5 w-5" />}
              color="rose"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <SectionCard
              icon={<MessageSquare className="h-5 w-5" />}
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

            <SectionCard
              icon={<Brain className="h-5 w-5" />}
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

            <SectionCard
              icon={<Mic className="h-5 w-5" />}
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

            <SectionCard
              icon={<BarChart3 className="h-5 w-5" />}
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

            <SectionCard
              icon={<Star className="h-5 w-5" />}
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

            <SectionCard
              icon={<RefreshCw className="h-5 w-5" />}
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
          </div>
        </TabsContent>

        {/* Conversations Tab */}
        <TabsContent value="conversations" className="mt-6">
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle>Conversation Analytics</CardTitle>
                <CardDescription>
                  Real-time analysis of all conversations with sentiment tracking and engagement metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6">
                    <p className="text-sm text-blue-600">Total Conversations</p>
                    <p className="text-3xl font-bold text-blue-900">{stats.conversations.total}</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6">
                    <p className="text-sm text-green-600">Currently Active</p>
                    <p className="text-3xl font-bold text-green-900">{stats.conversations.active}</p>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-6">
                    <p className="text-sm text-emerald-600">Avg Duration</p>
                    <p className="text-3xl font-bold text-emerald-900">{stats.conversations.avgDuration}</p>
                  </div>
                  <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-6">
                    <p className="text-sm text-cyan-600">Positive Sentiment</p>
                    <p className="text-3xl font-bold text-cyan-900">{stats.conversations.sentiment.positive}%</p>
                  </div>
                </div>
                <Button className="w-full" asChild>
                  <a href="/disposition-intelligence?tab=conversation-quality">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    View All Conversations
                  </a>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Dispositions Tab */}
        <TabsContent value="dispositions" className="mt-6">
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle>Disposition Intelligence</CardTitle>
                <CardDescription>
                  AI-powered call classification with real-time disposition tracking and lead creation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6">
                    <p className="text-sm text-green-600">Qualified Leads</p>
                    <p className="text-3xl font-bold text-green-900">{stats.dispositions.qualified_leads}</p>
                  </div>
                  <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-6">
                    <p className="text-sm text-red-600">Not Interested</p>
                    <p className="text-3xl font-bold text-red-900">{stats.dispositions.notInterested}</p>
                  </div>
                  <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-6">
                    <p className="text-sm text-yellow-600">Needs Review</p>
                    <p className="text-3xl font-bold text-yellow-900">{stats.dispositions.needsReview}</p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6">
                    <p className="text-sm text-blue-600">Total Classified</p>
                    <p className="text-3xl font-bold text-blue-900">
                      {stats.dispositions.qualified + stats.dispositions.notInterested + stats.dispositions.needsReview}
                    </p>
                  </div>
                </div>
                <Button className="w-full" asChild>
                  <a href="/disposition-intelligence?tab=disposition-intelligence">
                    <Brain className="mr-2 h-4 w-4" />
                    View Disposition Details
                  </a>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Recordings Tab */}
        <TabsContent value="recordings" className="mt-6">
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle>Call Recordings</CardTitle>
                <CardDescription>
                  Stored call recordings with quality scoring and analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6">
                    <p className="text-sm text-purple-600">Total Recordings</p>
                    <p className="text-3xl font-bold text-purple-900">{stats.recordings.total}</p>
                  </div>
                  <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-6">
                    <p className="text-sm text-indigo-600">Analyzed</p>
                    <p className="text-3xl font-bold text-indigo-900">{stats.recordings.analyzed}</p>
                  </div>
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-6">
                    <p className="text-sm text-orange-600">Pending Analysis</p>
                    <p className="text-3xl font-bold text-orange-900">{stats.recordings.pending}</p>
                  </div>
                  <div className="bg-gradient-to-br from-sky-50 to-sky-100 rounded-lg p-6">
                    <p className="text-sm text-sky-600">Avg Quality</p>
                    <p className="text-3xl font-bold text-sky-900">{stats.recordings.avgQuality}%</p>
                  </div>
                </div>
                <Button className="w-full" asChild>
                  <a href="/disposition-intelligence?tab=conversation-quality">
                    <Play className="mr-2 h-4 w-4" />
                    Browse Call Recordings
                  </a>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="mt-6">
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle>Reports & Analytics</CardTitle>
                <CardDescription>
                  Comprehensive performance reports and analytics dashboards
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-6">
                    <p className="text-sm text-amber-600">Generated Reports</p>
                    <p className="text-3xl font-bold text-amber-900">{stats.reports.generated}</p>
                  </div>
                  <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg p-6">
                    <p className="text-sm text-rose-600">Pending Reports</p>
                    <p className="text-3xl font-bold text-rose-900">{stats.reports.pending}</p>
                  </div>
                  <div className="bg-gradient-to-br from-lime-50 to-lime-100 rounded-lg p-6">
                    <p className="text-sm text-lime-600">Report Accuracy</p>
                    <p className="text-3xl font-bold text-lime-900">{stats.reports.accuracy}%</p>
                  </div>
                  <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-6">
                    <p className="text-sm text-teal-600">This Period</p>
                    <p className="text-3xl font-bold text-teal-900">Active</p>
                  </div>
                </div>
                <Button className="w-full" asChild>
                  <a href="/reports">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    View All Reports
                  </a>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Showcase Tab */}
        <TabsContent value="showcase" className="mt-6">
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle>Showcase Calls</CardTitle>
                <CardDescription>
                  Best performing calls for training, coaching, and quality reference
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg p-6">
                    <p className="text-sm text-rose-600">Best Calls</p>
                    <p className="text-3xl font-bold text-rose-900">{stats.showcaseCalls.best}</p>
                  </div>
                  <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg p-6">
                    <p className="text-sm text-pink-600">Training Materials</p>
                    <p className="text-3xl font-bold text-pink-900">{stats.showcaseCalls.training}</p>
                  </div>
                  <div className="bg-gradient-to-br from-fuchsia-50 to-fuchsia-100 rounded-lg p-6">
                    <p className="text-sm text-fuchsia-600">Quality Score</p>
                    <p className="text-3xl font-bold text-fuchsia-900">{stats.showcaseCalls.quality}%</p>
                  </div>
                  <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-lg p-6">
                    <p className="text-sm text-violet-600">Updated</p>
                    <p className="text-3xl font-bold text-violet-900">Today</p>
                  </div>
                </div>
                <Button className="w-full" asChild>
                  <a href="/disposition-intelligence?tab=showcase-calls">
                    <Star className="mr-2 h-4 w-4" />
                    Watch Showcase Calls
                  </a>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Quick Actions */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Button variant="outline" className="h-12" asChild>
          <a href="/disposition-intelligence?tab=conversation-quality">
            <MessageSquare className="mr-2 h-4 w-4" />
            Conversations
          </a>
        </Button>
        <Button variant="outline" className="h-12" asChild>
          <a href="/disposition-intelligence?tab=disposition-intelligence">
            <Brain className="mr-2 h-4 w-4" />
            Dispositions
          </a>
        </Button>
        <Button variant="outline" className="h-12" asChild>
          <a href="/disposition-intelligence?tab=conversation-quality">
            <Mic className="mr-2 h-4 w-4" />
            Recordings
          </a>
        </Button>
        <Button variant="outline" className="h-12" asChild>
          <a href="/reports">
            <BarChart3 className="mr-2 h-4 w-4" />
            Reports
          </a>
        </Button>
      </motion.div>
    </motion.div>
  );
}

export default UnifiedIntelligenceDashboard;
