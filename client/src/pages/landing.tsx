import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  Target,
  Users,
  Phone,
  Mail,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  Zap,
  Search,
  Filter,
  Lightbulb,
  Play,
  ChevronRight,
  Sparkles,
  Globe,
  Database,
  Shield,
  Award,
  TrendingUp,
  Mic,
  FileText,
  Video,
  Calendar,
  UserCheck,
  ClipboardCheck,
  BadgeCheck,
  PenTool,
  Bot,
  Layers,
  AlertTriangle,
  XCircle,
  Volume2,
  BarChart3,
  RefreshCw,
  Lock,
  Headphones,
  Building2,
  CircleDot,
  Quote,
} from "lucide-react";

export default function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/5 border border-violet-500/10 shrink-0">
              <div className="relative flex items-center justify-center">
                <span className="font-bold text-sm text-violet-700 tracking-tighter">DG</span>
                <Sparkles className="h-2 w-2 text-blue-500 absolute -top-1 -right-1.5" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg leading-tight">DemandGentic.ai</span>
              <span className="text-[10px] text-muted-foreground font-medium">Human Intel, AI Execute By Pivotal B2B</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#platform" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Platform</a>
            <a href="#services" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Services</a>
            <a href="#data" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Data</a>
            <a href="/resources-centre" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Resources</a>
            <a href="#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">About</a>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation("/login")}>
              Sign In
            </Button>
            <Button onClick={() => setLocation("/book/admin/demo")} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
              Schedule Demo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-24 px-6 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-50 via-background to-blue-50" />
        <div className="absolute top-20 right-0 w-[800px] h-[800px] bg-gradient-to-br from-violet-500/10 to-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl" />

        {/* Grid Pattern Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center max-w-4xl mx-auto">
            <Badge className="mb-6 px-4 py-2 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 text-violet-700 border-violet-200/50 hover:bg-violet-500/10">
              <Sparkles className="h-3.5 w-3.5 mr-2" />
              Agentic B2B Demand Generation
            </Badge>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              <span className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent">
                The End of Algorithmic Noise.
              </span>
              <br />
              <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
                The Era of Agentic Reasoning.
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed max-w-3xl mx-auto">
              Precision B2B demand generation powered by account-aware intelligence.
              Expert strategists + autonomous AI agents + 70M+ verified contacts.
            </p>

            {/* Stats Pills */}
            <div className="flex flex-wrap justify-center gap-3 mb-10">
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-md border">
                <Database className="h-4 w-4 text-violet-600" />
                <span className="text-sm font-semibold">70M+ Verified Contacts</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-md border">
                <Globe className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold">195+ Countries</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-md border">
                <Target className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold">98% Data Accuracy</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-md border">
                <Phone className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold">AI Voice Agents</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={() => setLocation("/book/admin/strategy")} className="text-base h-14 px-8 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/25">
                Schedule Strategy Call
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="text-base h-14 px-8 border-2">
                <Play className="mr-2 h-5 w-5" />
                See Platform in Action
              </Button>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="mt-16 pt-8 border-t">
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900">2M+</p>
                <p className="text-sm text-muted-foreground">Leads Generated</p>
              </div>
              <div className="h-8 w-px bg-slate-200 hidden md:block" />
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900">500+</p>
                <p className="text-sm text-muted-foreground">Enterprise Clients</p>
              </div>
              <div className="h-8 w-px bg-slate-200 hidden md:block" />
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900">10+</p>
                <p className="text-sm text-muted-foreground">Years B2B Expertise</p>
              </div>
              <div className="h-8 w-px bg-slate-200 hidden md:block" />
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900">40+</p>
                <p className="text-sm text-muted-foreground">Industries Served</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-24 px-6 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/10">
              <AlertTriangle className="h-3.5 w-3.5 mr-2" />
              The Problem
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              The World is Drowning in{" "}
              <span className="text-red-400">Unintelligent Outreach.</span>
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Traditional demand generation is broken. Buyers are overwhelmed,
              trust is eroding, and real solutions never reach the right ears.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {/* Problem Card 1 */}
            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
                  <Volume2 className="h-7 w-7 text-red-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2">01 — The Noise</div>
                <h3 className="text-xl font-bold mb-3 text-white">Volume Over Intent</h3>
                <p className="text-slate-400 mb-4">
                  Automated spam erodes buyer trust. Spray-and-pray tactics ignore context,
                  damage brands, and train prospects to delete without reading.
                </p>
                <div className="flex items-center gap-2 text-red-400">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">91% of B2B emails ignored</span>
                </div>
              </CardContent>
            </Card>

            {/* Problem Card 2 */}
            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
                  <Database className="h-7 w-7 text-amber-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">02 — The Waste</div>
                <h3 className="text-xl font-bold mb-3 text-white">Dirty Data, Hollow Metrics</h3>
                <p className="text-slate-400 mb-4">
                  Decisions made on outdated contacts and vanity metrics. Generic sequences
                  that fail to reason or adapt to real buyer signals.
                </p>
                <div className="flex items-center gap-2 text-amber-400">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">30% of B2B data decays yearly</span>
                </div>
              </CardContent>
            </Card>

            {/* Problem Card 3 */}
            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6">
                  <Target className="h-7 w-7 text-blue-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2">03 — The Loss</div>
                <h3 className="text-xl font-bold mb-3 text-white">Solutions Miss Their Audience</h3>
                <p className="text-slate-400 mb-4">
                  Real solutions never reach the right ear because they lack the right story,
                  the right timing, and the right context.
                </p>
                <div className="flex items-center gap-2 text-blue-400">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">67% of journeys happen pre-sales</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Summary Statement */}
          <div className="text-center">
            <div className="inline-block p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur">
              <p className="text-lg text-slate-300 mb-4">
                CRMs store data. Marketing tools send messages. SDRs chase activity.
              </p>
              <p className="text-2xl font-bold text-white">
                None of them truly <span className="text-violet-400">reason</span>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-24 px-6 relative overflow-hidden" id="platform">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-white" />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
              <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
              Our Solution
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Services + Intelligence + Data ={" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                Demand That Converts.
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              DemandGentic.ai is not just a platform. It's a full-service demand generation partner
              powered by autonomous AI, world-class data, and expert strategists.
            </p>
          </div>

          {/* Three Pillars */}
          <div className="grid lg:grid-cols-3 gap-8 mb-16">
            {/* Pillar 1 */}
            <Card className="border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white shadow-xl shadow-violet-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl" />
              <CardContent className="p-8 relative">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/25">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <Badge className="mb-4 bg-violet-100 text-violet-700 border-none">Expert Services</Badge>
                <h3 className="text-2xl font-bold mb-3">Human Expertise</h3>
                <p className="text-muted-foreground mb-6">
                  Dedicated strategists design, monitor, and optimize every campaign.
                  AI executes; humans ensure excellence.
                </p>
                <div className="p-4 rounded-xl bg-violet-50 border border-violet-100">
                  <p className="text-sm font-medium text-violet-900">
                    "We don't hand you software and walk away. We deliver outcomes."
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Pillar 2 */}
            <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white shadow-xl shadow-indigo-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl" />
              <CardContent className="p-8 relative">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/25">
                  <Brain className="h-8 w-8 text-white" />
                </div>
                <Badge className="mb-4 bg-indigo-100 text-indigo-700 border-none">AI Agents</Badge>
                <h3 className="text-2xl font-bold mb-3">Agentic Intelligence</h3>
                <p className="text-muted-foreground mb-6">
                  Purpose-built AI agents that research accounts, craft personalized messaging,
                  and execute across voice, email, and digital.
                </p>
                <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                  <p className="text-sm font-medium text-indigo-900">
                    "AI that thinks like your best SDR — at unlimited scale."
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Pillar 3 */}
            <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-xl shadow-blue-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />
              <CardContent className="p-8 relative">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-6 shadow-lg shadow-blue-500/25">
                  <Database className="h-8 w-8 text-white" />
                </div>
                <Badge className="mb-4 bg-blue-100 text-blue-700 border-none">Global Data</Badge>
                <h3 className="text-2xl font-bold mb-3">Precision Data</h3>
                <p className="text-muted-foreground mb-6">
                  70M+ verified contacts across 195 countries. 98% email accuracy.
                  Weekly refresh. Multi-source verification.
                </p>
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                  <p className="text-sm font-medium text-blue-900">
                    "Your campaigns are only as good as your data. Ours is the best."
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Flow Diagram */}
          <div className="p-8 rounded-3xl bg-slate-900 text-white">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold mb-2">How It Comes Together</h3>
              <p className="text-slate-400">A unified flow from strategy to qualified pipeline</p>
            </div>
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
              {[
                { icon: Target, label: "Your Goals", color: "violet" },
                { icon: Users, label: "Our Strategists Design", color: "violet" },
                { icon: Search, label: "AI Agents Research", color: "indigo" },
                { icon: Database, label: "Data Fuels Targeting", color: "blue" },
                { icon: Zap, label: "Agentic Execution", color: "emerald" },
                { icon: TrendingUp, label: "Qualified Pipeline", color: "emerald" },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`h-12 w-12 rounded-xl bg-${step.color}-500/20 flex items-center justify-center mb-2`}>
                      <step.icon className={`h-6 w-6 text-${step.color}-400`} />
                    </div>
                    <span className="text-sm text-center text-slate-300 max-w-[100px]">{step.label}</span>
                  </div>
                  {i < 5 && (
                    <ChevronRight className="h-5 w-5 text-slate-600 hidden lg:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-200">
              The Process
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              From Intelligence to Pipeline.{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Delivered.</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              A proven five-step process that combines human strategy with agentic AI execution.
            </p>
          </div>

          {/* Process Steps */}
          <div className="grid md:grid-cols-5 gap-6">
            {[
              {
                step: "01",
                icon: Lightbulb,
                title: "Discovery & Strategy",
                description: "Our strategists map your solutions to buyer problems. We define ICP, build frameworks, and design campaign architecture.",
                deliverable: "Custom campaign strategy",
                color: "violet",
              },
              {
                step: "02",
                icon: Search,
                title: "Intelligence Activation",
                description: "AI agents scan our 70M+ database, research accounts, verify facts, and match prospects to your problem framework.",
                deliverable: "Verified target accounts",
                color: "indigo",
              },
              {
                step: "03",
                icon: PenTool,
                title: "Precision Content",
                description: "AI generates personalized emails, call scripts, and objection responses. Human strategists review and refine.",
                deliverable: "Campaign-ready content",
                color: "blue",
              },
              {
                step: "04",
                icon: Zap,
                title: "Agentic Execution",
                description: "Live voice agents make calls. Intelligent email sequences deploy. Real-time quality auditing on every interaction.",
                deliverable: "Active campaign execution",
                color: "emerald",
              },
              {
                step: "05",
                icon: TrendingUp,
                title: "Optimization & Handoff",
                description: "Continuous analysis identifies what's working. AI optimizes in real-time. Qualified leads delivered to your sales team.",
                deliverable: "BANT-qualified leads",
                color: "amber",
              },
            ].map((item, i) => (
              <div key={i} className="relative">
                <Card className="h-full border-2 hover:shadow-lg transition-shadow bg-white">
                  <CardContent className="p-6">
                    <div className={`h-12 w-12 rounded-xl bg-gradient-to-br from-${item.color}-500 to-${item.color}-600 flex items-center justify-center mb-4 shadow-lg`}>
                      <item.icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Step {item.step}</div>
                    <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{item.description}</p>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className={`h-4 w-4 text-${item.color}-500`} />
                      <span className="font-medium">{item.deliverable}</span>
                    </div>
                  </CardContent>
                </Card>
                {i < 4 && (
                  <ChevronRight className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 h-6 w-6 text-slate-300 z-10" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data Section */}
      <section className="py-24 px-6 bg-gradient-to-br from-blue-950 via-indigo-950 to-violet-950 text-white relative overflow-hidden" id="data">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-white/10 text-white border-white/20 hover:bg-white/10">
              <Database className="h-3.5 w-3.5 mr-2" />
              Our Data Advantage
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              The Most Accurate B2B Data{" "}
              <span className="text-blue-400">on the Planet.</span>
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Your campaigns are only as good as your data. We invested in building
              the most comprehensive, accurate, and actionable B2B database available.
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid md:grid-cols-4 gap-6 mb-16">
            {[
              { number: "70M+", label: "Verified B2B Contacts", sublabel: "Decision-makers across every industry", icon: Users },
              { number: "195+", label: "Countries Covered", sublabel: "True global reach for campaigns", icon: Globe },
              { number: "98%", label: "Email Accuracy", sublabel: "Real-time verification before send", icon: Target },
              { number: "Weekly", label: "Data Refresh", sublabel: "Continuous hygiene eliminates decay", icon: RefreshCw },
            ].map((stat, i) => (
              <Card key={i} className="bg-white/5 border-white/10 backdrop-blur text-center">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                    <stat.icon className="h-6 w-6 text-blue-400" />
                  </div>
                  <p className="text-4xl font-bold text-white mb-1">{stat.number}</p>
                  <p className="font-semibold text-white mb-1">{stat.label}</p>
                  <p className="text-sm text-slate-400">{stat.sublabel}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Data Capabilities */}
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Verification</h3>
                </div>
                <ul className="space-y-3">
                  {[
                    "Multi-source contact validation",
                    "Real-time email verification",
                    "Phone number confirmation",
                    "LinkedIn profile matching",
                    "Company record cross-reference",
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-slate-300">
                      <CircleDot className="h-3 w-3 text-emerald-400" />
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Layers className="h-5 w-5 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Enrichment</h3>
                </div>
                <ul className="space-y-3">
                  {[
                    "Firmographics (revenue, size, industry)",
                    "Technographics (tech stack detection)",
                    "Intent data (buying signals)",
                    "Organizational hierarchy mapping",
                    "Recent news and trigger events",
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-slate-300">
                      <CircleDot className="h-3 w-3 text-blue-400" />
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                    <Brain className="h-5 w-5 text-violet-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Intelligence</h3>
                </div>
                <ul className="space-y-3">
                  {[
                    "Buying committee identification",
                    "Problem-to-account matching",
                    "Confidence scoring on all data",
                    "Source attribution for verification",
                    "Continuous data hygiene",
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-slate-300">
                      <CircleDot className="h-3 w-3 text-violet-400" />
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Data Promise */}
          <div className="mt-12 p-8 rounded-2xl bg-white/5 border border-white/10 text-center">
            <h3 className="text-2xl font-bold text-white mb-4">
              No Hallucinations. No Guesswork. No Decay.
            </h3>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Every fact in our database is tagged as verified, inferred, or unknown — with full source attribution.
              We don't just collect data; we collect evidence.
            </p>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-24 px-6" id="services">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50">
              Our Services
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Full-Service Demand Generation.{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">AI-Powered Results.</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              We don't just provide tools — we deliver results. Choose the services that match your pipeline goals.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Target,
                badge: "ABM",
                title: "AI-Led Account-Based Marketing",
                description: "Target, engage, and convert high-value accounts with intelligence-driven orchestration across email, voice, and content.",
                features: ["Buying committee mapping", "Cross-channel orchestration", "Account-level reasoning"],
                ideal: "Enterprise & mid-market B2B",
                color: "violet",
              },
              {
                icon: FileText,
                badge: "Content Demand",
                title: "Content-Led Demand Generation",
                description: "Whitepapers, research reports, webinars, and solution assets — promoted through intelligent, compliant outreach.",
                features: ["Strategic asset distribution", "High-intent qualification", "Opt-in consent capture"],
                ideal: "Brand authority & pipeline",
                color: "blue",
              },
              {
                icon: Bot,
                badge: "AI SDR",
                title: "AI SDR-as-a-Service",
                description: "Autonomous AI agents conduct first-touch outreach, qualification, follow-ups, and meeting booking.",
                features: ["24/7 autonomous engagement", "Human strategist oversight", "Intelligent escalation"],
                ideal: "Scale without headcount",
                color: "emerald",
              },
              {
                icon: Calendar,
                badge: "Appointments",
                title: "Qualified Appointment Generation",
                description: "We deliver BANT-qualified sales appointments directly to your team's calendar.",
                features: ["Full top-of-funnel management", "Multi-channel outreach", "No-show follow-up"],
                ideal: "Sales efficiency",
                color: "amber",
              },
              {
                icon: Search,
                badge: "Intelligence",
                title: "Market & Account Intelligence",
                description: "Deep research, enrichment, and analysis of accounts and industries to power better GTM decisions.",
                features: ["ICP refinement", "Competitive landscape", "Buying signal detection"],
                ideal: "GTM strategy",
                color: "indigo",
              },
              {
                icon: Database,
                badge: "Data",
                title: "B2B Data & Enrichment",
                description: "Access our 70M+ verified contact database or enrich your existing data with our verification engine.",
                features: ["Custom list building", "Database enrichment", "Continuous hygiene"],
                ideal: "Campaign fuel",
                color: "cyan",
              },
            ].map((service, i) => (
              <Card key={i} className="border-2 hover:shadow-xl transition-all hover:-translate-y-1 bg-white">
                <CardContent className="p-8">
                  <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br from-${service.color}-500 to-${service.color}-600 flex items-center justify-center mb-6 shadow-lg`}>
                    <service.icon className="h-7 w-7 text-white" />
                  </div>
                  <Badge className={`mb-4 bg-${service.color}-50 text-${service.color}-700 border-none`}>{service.badge}</Badge>
                  <h3 className="text-xl font-bold mb-3">{service.title}</h3>
                  <p className="text-muted-foreground mb-4">{service.description}</p>
                  <ul className="space-y-2 mb-6">
                    {service.features.map((feature, j) => (
                      <li key={j} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className={`h-4 w-4 text-${service.color}-500`} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-4 border-t">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">Ideal for:</span> {service.ideal}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* AI Agents Section */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50">
              <Bot className="h-3.5 w-3.5 mr-2" />
              AI Agent Suite
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Purpose-Built Agents for{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Every Function.</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Not generic AI. Specialized agents trained on a decade of B2B demand generation expertise.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {[
              {
                icon: Search,
                title: "Research Agent",
                subtitle: "Demand Intel",
                description: "Autonomous fact-gathering and strategic synthesis. Researches accounts and generates actionable intelligence.",
                capabilities: ["Multi-source verification", "Problem-to-account matching", "Confidence scoring"],
                color: "emerald",
              },
              {
                icon: Phone,
                title: "Voice Agent",
                subtitle: "Live Calling",
                description: "Real-time conversational AI that makes actual phone calls. Natural conversation with live objection handling.",
                capabilities: ["Gatekeeper navigation", "BANT qualification", "Real-time adaptation"],
                color: "amber",
              },
              {
                icon: Mail,
                title: "Email Agent",
                subtitle: "Demand Engage",
                description: "AI trained on millions of B2B campaigns. Knows what converts and when to follow up.",
                capabilities: ["Persona-specific copy", "Sequence optimization", "Reply sentiment analysis"],
                color: "blue",
              },
              {
                icon: Shield,
                title: "QA Agent",
                subtitle: "Compliance",
                description: "Real-time auditing for quality, accuracy, and compliance. Ensures innocent-first engagement.",
                capabilities: ["Real-time monitoring", "Policy enforcement", "Audit trail generation"],
                color: "rose",
              },
            ].map((agent, i) => (
              <Card key={i} className="border-2 bg-white hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-br from-${agent.color}-500 to-${agent.color}-600 flex items-center justify-center mb-4`}>
                    <agent.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="mb-4">
                    <h3 className="font-bold text-lg">{agent.title}</h3>
                    <p className={`text-sm text-${agent.color}-600`}>{agent.subtitle}</p>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">{agent.description}</p>
                  <ul className="space-y-1">
                    {agent.capabilities.map((cap, j) => (
                      <li key={j} className="flex items-center gap-2 text-xs text-slate-600">
                        <CheckCircle2 className={`h-3 w-3 text-${agent.color}-500`} />
                        {cap}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Agent Architecture */}
          <Card className="bg-slate-900 text-white border-none">
            <CardContent className="p-8">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Layers className="h-5 w-5 text-violet-400" />
                    <span className="text-sm font-bold uppercase tracking-wider text-violet-400">Agent Architecture</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Agents That Truly Understand Your Business</h3>
                  <p className="text-slate-400 mb-6">
                    Every agent inherits your Organization Intelligence — positioning, ICP, problem framework,
                    and compliance rules. Campaign-specific context layers on top for precision execution.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {["Org Identity", "Service Catalog", "Problem Framework", "Compliance Policy"].map((item, i) => (
                      <Badge key={i} className="bg-white/10 border-white/20 text-white">{item}</Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3 mb-2">
                      <Bot className="h-5 w-5 text-slate-400" />
                      <span className="font-semibold">Foundation Layer</span>
                    </div>
                    <p className="text-sm text-slate-400">Core capabilities: gatekeeper handling, verification, objection detection</p>
                  </div>
                  <div className="p-4 rounded-xl bg-violet-500/20 border border-violet-500/30">
                    <div className="flex items-center gap-3 mb-2">
                      <Target className="h-5 w-5 text-violet-400" />
                      <span className="font-semibold">+ Campaign Context</span>
                    </div>
                    <p className="text-sm text-slate-300">Account briefing, talking points, qualification rules, success criteria</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Philosophy Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100">
              Our Beliefs
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              The Four Principles of{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Intelligent Demand.</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              These beliefs inform every model we train, every agent we deploy, and every campaign we run.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {[
              {
                number: "01",
                title: "Permission is Earned",
                description: "Every touchpoint is an opportunity to prove value. If you haven't done the research, you don't have the right to their time.",
                icon: UserCheck,
              },
              {
                number: "02",
                title: "Context Over Content",
                description: "Great copy is worthless if sent to the wrong person at the wrong time. We prioritize business context above all else.",
                icon: Target,
              },
              {
                number: "03",
                title: "Data is Evidence",
                description: "We don't just collect data; we look for evidence. Our agents reason through conflicting signals to find the truth.",
                icon: Search,
              },
              {
                number: "04",
                title: "Judgment at Scale",
                description: "Automating judgment is the only way to scale demand without scaling noise. We build systems that think.",
                icon: Brain,
              },
            ].map((principle, i) => (
              <Card key={i} className="border-2 hover:shadow-lg transition-shadow bg-white">
                <CardContent className="p-8">
                  <div className="text-4xl font-bold text-slate-200 mb-4">{principle.number}</div>
                  <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
                    <principle.icon className="h-6 w-6 text-slate-700" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{principle.title}</h3>
                  <p className="text-muted-foreground">{principle.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center p-8 rounded-2xl bg-slate-900 text-white">
            <p className="text-2xl font-bold">
              Intelligence isn't a feature.{" "}
              <span className="text-violet-400">It's the foundation.</span>
            </p>
          </div>
        </div>
      </section>

      {/* Founder Section */}
      <section className="py-24 px-6 bg-slate-50" id="about">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-5 gap-12 items-center">
            <div className="md:col-span-2">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-3xl transform rotate-3"></div>
                <div className="relative bg-slate-900 rounded-3xl p-8 text-white">
                  <Quote className="h-10 w-10 text-violet-400 mb-6" />
                  <div className="space-y-4">
                    <div className="text-4xl font-bold">10+</div>
                    <div className="text-slate-400">Years in B2B</div>
                    <div className="h-px bg-slate-700 my-4" />
                    <div className="text-4xl font-bold">2M+</div>
                    <div className="text-slate-400">Leads Generated</div>
                    <div className="h-px bg-slate-700 my-4" />
                    <div className="text-4xl font-bold">500+</div>
                    <div className="text-slate-400">Enterprise Clients</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="md:col-span-3">
              <Badge className="mb-4 bg-violet-50 text-violet-700 border-violet-200">Our Story</Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Built in the Trenches.{" "}
                <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Designed for Truth.</span>
              </h2>
              <blockquote className="text-xl text-muted-foreground mb-6 border-l-4 border-violet-500 pl-6 italic">
                "Starting Pivotal B2B in Afghanistan in 2017 taught me that technology is only as good as the purpose
                behind it. In high-stakes environments, you learn that every interaction counts and every mistake is public.
                We built DemandGentic.ai to be a steward of progress — a system that uses data to solve problems, not just create noise."
              </blockquote>
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xl">
                  ZM
                </div>
                <div>
                  <p className="font-bold">Zahid Mohammadi</p>
                  <p className="text-muted-foreground">Founder & Chief AI Architect</p>
                </div>
              </div>
              <p className="mt-6 text-muted-foreground">
                DemandGentic.ai is built by Pivotal B2B — a team with over a decade in the trenches of global B2B demand generation.
                From Afghanistan to enterprise clients worldwide, we didn't build theory. We built what actually works.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />

        <div className="max-w-4xl mx-auto text-center relative">
          <Badge className="mb-6 bg-white/20 text-white border-white/30 hover:bg-white/20">
            Get Started
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to Build Demand That Actually Converts?
          </h2>
          <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
            Join the revenue teams replacing noise with intelligence. See how our combination of
            expert services, AI agents, and precision data can transform your pipeline.
          </p>

          {/* Value Pills */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {[
              "70M+ Verified Contacts",
              "98% Data Accuracy",
              "AI Voice Agents",
              "Full-Service Delivery",
            ].map((pill, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">{pill}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Button size="lg" className="text-base h-14 px-8 bg-white text-violet-700 hover:bg-white/90 shadow-lg">
              Schedule Strategy Call
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="text-base h-14 px-8 border-2 border-white/30 text-white hover:bg-white/10">
              <Play className="mr-2 h-5 w-5" />
              See the Platform
            </Button>
          </div>

          <p className="text-white/60 text-sm">
            No pressure. No pitch decks. Just a conversation about your pipeline goals.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-5 gap-12 mb-12">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 border border-white/20 shrink-0">
                  <div className="relative flex items-center justify-center">
                    <span className="font-bold text-sm text-white tracking-tighter">DG</span>
                    <Sparkles className="h-2 w-2 text-blue-400 absolute -top-1 -right-1.5" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-lg leading-tight">DemandGentic.ai</span>
                  <span className="text-[10px] text-slate-400 font-medium">Human Intel, AI Execute By Pivotal B2B</span>
                </div>
              </div>
              <p className="text-slate-400 text-sm mb-4">
                The end of algorithmic noise. The era of agentic reasoning.
              </p>
              <div className="text-slate-500 text-xs space-y-1">
                <p className="font-medium text-slate-400">Pivotal B2B LLC</p>
                <p>Lewes, Delaware</p>
                <p><a href="tel:+14179003844" className="hover:text-white transition-colors">(417) 900-3844</a></p>
                <p><a href="https://pivotal-b2b.com/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">pivotal-b2b.com</a></p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#platform" className="hover:text-white transition-colors">AI Agents</a></li>
                <li><a href="#data" className="hover:text-white transition-colors">Data & Intelligence</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Services</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#services" className="hover:text-white transition-colors">AI-Led ABM</a></li>
                <li><a href="#services" className="hover:text-white transition-colors">Content Demand</a></li>
                <li><a href="#services" className="hover:text-white transition-colors">AI SDR</a></li>
                <li><a href="#services" className="hover:text-white transition-colors">Appointments</a></li>
                <li><a href="#services" className="hover:text-white transition-colors">Data Services</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="/resources-centre" className="hover:text-white transition-colors">Resources Center</a></li>
                <li><a href="#about" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="/about" className="hover:text-white transition-colors">Our Story</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Get Started</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="/login" className="hover:text-white transition-colors">Schedule a Meeting</a></li>
                <li><a href="/login" className="hover:text-white transition-colors">Request a Proposal</a></li>
                <li><a href="mailto:contact@pivotal-b2b.com" className="hover:text-white transition-colors">Contact Us</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-sm">
              © 2024 Pivotal B2B LLC. All rights reserved. DemandGentic.ai is a product of Pivotal B2B LLC.
            </p>
            <div className="flex gap-6 text-slate-500 text-sm">
              <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="/gdpr" className="hover:text-white transition-colors">GDPR</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
