import { ChatInterface } from "@/components/ai-studio/operator/chat-interface";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, Zap, Brain, Target, 
  LineChart, Users, Mail, Database, Clock,
  ArrowRight, Lightbulb, Rocket, Shield,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";

const quickCommands = [
  {
    icon: LineChart,
    title: "Pipeline Analysis",
    description: "Analyze pipeline health and identify bottlenecks",
    command: "Analyze my sales pipeline and show me deals at risk",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Users,
    title: "Lead Insights",
    description: "Get AI-powered lead scoring and recommendations",
    command: "Show me my top 10 leads by conversion probability",
    color: "from-violet-500 to-purple-500",
  },
  {
    icon: Mail,
    title: "Campaign Performance",
    description: "Review email campaign metrics and optimization tips",
    command: "How are my email campaigns performing this month?",
    color: "from-orange-500 to-amber-500",
  },
  {
    icon: Database,
    title: "CRM Overview",
    description: "Get a complete snapshot of your CRM data",
    command: "Give me a full CRM overview with key metrics",
    color: "from-emerald-500 to-teal-500",
  },
];

const agentCapabilities = [
  { icon: Brain, label: "Natural Language", desc: "Speak naturally" },
  { icon: Zap, label: "Autonomous", desc: "Self-executing" },
  { icon: Target, label: "Multi-step", desc: "Complex tasks" },
  { icon: Shield, label: "Safe Actions", desc: "Review before apply" },
];

const recentActivity = [
  { action: "Analyzed Q4 pipeline health", time: "2 min ago", status: "completed" },
  { action: "Generated lead segment report", time: "15 min ago", status: "completed" },
  { action: "Identified 12 stalled deals", time: "1 hour ago", status: "completed" },
];

export default function AgenticCRMOperatorPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-green-300 animate-pulse" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  Agentic Command Center
                </h1>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <Activity className="h-3 w-3 text-green-500" />
                    AI Agent Online
                  </span>
                  <span className="text-muted-foreground/40">•</span>
                  <span>Voice & Text Control</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="px-3 py-1.5 bg-violet-500/10 text-violet-600 border-violet-500/30">
                <Zap className="h-3 w-3 mr-1" />
                Autonomous Mode
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr,380px] max-w-[1600px] mx-auto">
          {/* Chat Panel - Main Area */}
          <div className="order-2 lg:order-1">
            <div className="h-[calc(100vh-12rem)] min-h-[500px]">
              <ChatInterface />
            </div>
          </div>

          {/* Side Panel */}
          <div className="order-1 lg:order-2 space-y-5">
            {/* Agent Capabilities */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-card to-card/50 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-fuchsia-500/5" />
              <CardHeader className="pb-3 relative">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <Brain className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Agent Capabilities</CardTitle>
                    <CardDescription className="text-xs">What I can do for you</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="relative">
                <div className="grid grid-cols-2 gap-2">
                  {agentCapabilities.map((cap, i) => (
                    <div 
                      key={i}
                      className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="h-7 w-7 rounded-md bg-background flex items-center justify-center shadow-sm">
                        <cap.icon className="h-3.5 w-3.5 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-xs font-medium leading-none">{cap.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{cap.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Commands */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                      <Lightbulb className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Quick Commands</CardTitle>
                      <CardDescription className="text-xs">Click to run instantly</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {quickCommands.map((cmd, i) => (
                  <button
                    key={i}
                    className={cn(
                      "w-full group relative overflow-hidden rounded-xl p-3 text-left transition-all duration-300",
                      "bg-gradient-to-r hover:shadow-md",
                      "border border-border/50 hover:border-transparent"
                    )}
                  >
                    <div className={cn(
                      "absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300",
                      `bg-gradient-to-r ${cmd.color}`
                    )} />
                    <div className="relative flex items-start gap-3">
                      <div className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300",
                        "bg-muted group-hover:bg-white/20",
                        `group-hover:shadow-lg`
                      )}>
                        <cmd.icon className={cn(
                          "h-4 w-4 transition-colors",
                          "text-muted-foreground group-hover:text-foreground"
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{cmd.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {cmd.description}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all transform translate-x-0 group-hover:translate-x-1 mt-1" />
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Recent Activity</CardTitle>
                    <CardDescription className="text-xs">Agent's latest actions</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentActivity.map((item, i) => (
                    <div 
                      key={i}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="h-6 w-6 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight line-clamp-1">{item.action}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tips Card */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-4 text-white shadow-lg">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <Rocket className="h-4 w-4" />
                  <span className="text-sm font-semibold">Pro Tip</span>
                </div>
                <p className="text-xs text-white/80 leading-relaxed">
                  Use voice commands for hands-free operation. Click the mic button and say 
                  "Show me all leads from last week" to get instant insights.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
