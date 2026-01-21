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
} from "lucide-react";

export default function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/demangent-logo.png"
              alt="DemandGentic.ai"
              className="h-8 w-auto"
            />
            <span className="font-bold text-lg">DemandGentic.ai</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation("/login")}>
              Sign In
            </Button>
            <Button onClick={() => setLocation("/login")}>
              Book Demo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-teal-500/5" />
        <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-teal-500/10 rounded-full blur-3xl opacity-50" />

        <div className="max-w-7xl mx-auto relative">
          <div className="max-w-3xl">
            <Badge className="mb-6 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
              Agentic B2B Demand Generation
            </Badge>

            <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
              Expert AI agents that earn demand across every channel.
            </h1>

            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Advanced, professional-grade intelligent campaigns across voice, email, and digital. AI that matches accounts to problems, generates precision content, and executes with human-level expertise.
            </p>

            {/* Channel Pills */}
            <div className="flex flex-wrap gap-3 mb-8">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-200">
                <Phone className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-700">AI Voice Agents</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200">
                <Mail className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700">Intelligent Email</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-50 border border-violet-200">
                <Globe className="h-4 w-4 text-violet-600" />
                <span className="text-sm font-medium text-violet-700">Digital Campaigns</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="text-base h-12 px-8">
                Book a Demo
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="text-base h-12 px-8">
                <Play className="mr-2 h-5 w-5" />
                Watch 2-Min Overview
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Process Section */}
      <section className="py-20 px-6 bg-slate-50 border-y">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-200">
              How It Works
            </Badge>
            <h2 className="text-4xl font-bold mb-4">
              Simple process. Precision results.
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              From problem intelligence to pipeline — a unified workflow that compounds with every campaign.
            </p>
          </div>

          {/* Process Flow */}
          <div className="relative">
            {/* Connection Line */}
            <div className="hidden lg:block absolute top-24 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 via-blue-500 via-emerald-500 via-amber-500 to-rose-500 rounded-full" />

            <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-8">
              {/* Step 1: Problem Intelligence */}
              <div className="relative">
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 h-full">
                  <div className="lg:absolute lg:-top-4 lg:left-1/2 lg:-translate-x-1/2 mb-4 lg:mb-0">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg mx-auto lg:mx-0">
                      <Brain className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <div className="lg:pt-12">
                    <div className="text-xs font-bold uppercase tracking-wider text-violet-500 mb-2">Step 1</div>
                    <h3 className="font-bold text-lg mb-2">Problem Intelligence</h3>
                    <p className="text-sm text-muted-foreground">
                      Map your solutions to specific problems. Define detection rules by account, department, and role.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 2: Precision Content */}
              <div className="relative">
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 h-full">
                  <div className="lg:absolute lg:-top-4 lg:left-1/2 lg:-translate-x-1/2 mb-4 lg:mb-0">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg mx-auto lg:mx-0">
                      <Target className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <div className="lg:pt-12">
                    <div className="text-xs font-bold uppercase tracking-wider text-blue-500 mb-2">Step 2</div>
                    <h3 className="font-bold text-lg mb-2">Pinpoint Content</h3>
                    <p className="text-sm text-muted-foreground">
                      AI generates messaging angles, openers, and scripts tailored to each problem-account match.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 3: Multi-Channel Activation */}
              <div className="relative">
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 h-full">
                  <div className="lg:absolute lg:-top-4 lg:left-1/2 lg:-translate-x-1/2 mb-4 lg:mb-0">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg mx-auto lg:mx-0">
                      <Zap className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <div className="lg:pt-12">
                    <div className="text-xs font-bold uppercase tracking-wider text-emerald-500 mb-2">Step 3</div>
                    <h3 className="font-bold text-lg mb-2">Agentic Activation</h3>
                    <p className="text-sm text-muted-foreground">
                      Deploy across email, phone, and events. AI agents execute with human-level control and compliance.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 4: Continuous Analysis */}
              <div className="relative">
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 h-full">
                  <div className="lg:absolute lg:-top-4 lg:left-1/2 lg:-translate-x-1/2 mb-4 lg:mb-0">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg mx-auto lg:mx-0">
                      <TrendingUp className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <div className="lg:pt-12">
                    <div className="text-xs font-bold uppercase tracking-wider text-amber-500 mb-2">Step 4</div>
                    <h3 className="font-bold text-lg mb-2">Agentic Analysis</h3>
                    <p className="text-sm text-muted-foreground">
                      AI continuously analyzes results, identifies patterns, and auto-optimizes messaging and targeting.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 5: Human Intelligence */}
              <div className="relative">
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 h-full">
                  <div className="lg:absolute lg:-top-4 lg:left-1/2 lg:-translate-x-1/2 mb-4 lg:mb-0">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg mx-auto lg:mx-0">
                      <Users className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <div className="lg:pt-12">
                    <div className="text-xs font-bold uppercase tracking-wider text-rose-500 mb-2">Step 5</div>
                    <h3 className="font-bold text-lg mb-2">Human Intelligence</h3>
                    <p className="text-sm text-muted-foreground">
                      Your team's insights feed back into the system. AI + human expertise compounds over time.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Summary Banner */}
          <div className="mt-12 p-6 rounded-2xl bg-slate-900 text-white">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-violet-400" />
                </div>
                <div>
                  <p className="font-bold text-lg">The Compound Effect</p>
                  <p className="text-sm text-slate-400">Every campaign makes the next one smarter. Problem intelligence + human feedback = exponential improvement.</p>
                </div>
              </div>
              <div className="flex gap-8 text-center">
                <div>
                  <p className="text-2xl font-bold text-violet-400">AI-Led</p>
                  <p className="text-xs text-slate-400">Execution</p>
                </div>
                <div className="h-12 w-px bg-slate-700" />
                <div>
                  <p className="text-2xl font-bold text-emerald-400">Human-Led</p>
                  <p className="text-xs text-slate-400">Intelligence</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem-Led Intelligence Section */}
      <section className="py-20 px-6 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-white/10 text-white border-white/20 hover:bg-white/10">
              The Intelligence Layer
            </Badge>
            <h2 className="text-4xl font-bold mb-4">
              Problem-Led Account Intelligence
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              You define the problems you solve. AI finds the accounts that have them — and writes the exact message for that match.
            </p>
          </div>

          {/* Pipeline Steps */}
          <div className="grid md:grid-cols-5 gap-4 mb-16">
            {[
              {
                step: "01",
                title: "Define Problems",
                description: "\"Companies scaling DevOps without infrastructure automation hit cost walls\"",
                icon: Lightbulb,
              },
              {
                step: "02",
                title: "Set Detection Rules",
                description: "Industries, tech stack required/missing, intent signals",
                icon: Filter,
              },
              {
                step: "03",
                title: "AI Scans Accounts",
                description: "Gathers facts, verifies sources, scores confidence",
                icon: Search,
              },
              {
                step: "04",
                title: "Matches to Problems",
                description: "\"This account has Problem #2 — The Efficiency Play\"",
                icon: Target,
              },
              {
                step: "05",
                title: "Writes the Angle",
                description: "Strategic opener, email, call script, objection responses",
                icon: MessageSquare,
              },
            ].map((item, i) => (
              <div key={i} className="relative">
                <Card className="bg-white/5 border-white/10 h-full">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        <item.icon className="h-5 w-5 text-primary" />
                      </div>
                      <span className="text-xs font-bold text-slate-500">{item.step}</span>
                    </div>
                    <h3 className="font-semibold mb-2 text-white">{item.title}</h3>
                    <p className="text-sm text-slate-400">{item.description}</p>
                  </CardContent>
                </Card>
                {i < 4 && (
                  <ChevronRight className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 h-6 w-6 text-slate-600 z-10" />
                )}
              </div>
            ))}
          </div>

          {/* Research + Reasoning Engines */}
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Search className="h-6 w-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Research Engine</h3>
                    <p className="text-sm text-slate-400">Truth Gathering</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Company Overview", detail: "Industry, HQ, size — verified from LinkedIn, website" },
                    { label: "Products & Features", detail: "Core offering, recent launches, pricing model" },
                    { label: "Customers & Proof", detail: "Logo wall, case studies, vertical focus" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-white">{item.label}</p>
                        <p className="text-sm text-slate-400">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-blue-300 font-medium mb-1">Confidence Scoring</p>
                  <p className="text-sm text-slate-300">Every fact tagged as verified, inferred, or unknown — with source citation</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 border-primary/30">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Brain className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Reasoning Engine</h3>
                    <p className="text-sm text-slate-400">Meaning + Strategy</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Problem Matching", detail: "\"Shows strong indicators of tech-debt in CX stack\"" },
                    { label: "Strategic Angle", detail: "\"The Efficiency Play\" — focus on the cost gap" },
                    { label: "Personalized Opener", detail: "\"I noticed you're scaling DevOps after the funding...\"" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Zap className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-white">{item.label}</p>
                        <p className="text-sm text-slate-400 italic">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-xs text-primary font-medium mb-1">Per-Problem Output</p>
                  <p className="text-sm text-slate-300">Email angle, call script, objection responses — all generated for this specific account-problem match</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* AI Agent Suite Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50">
              AI Agent Suite
            </Badge>
            <h2 className="text-4xl font-bold mb-4">
              Specialized agents for every demand gen function.
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Not generic AI. Purpose-built agents trained on 10+ years of frontline B2B demand generation experience.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Email Agents */}
            <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-lg">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-blue-500 flex items-center justify-center mb-6">
                  <Mail className="h-7 w-7 text-white" />
                </div>
                <Badge className="mb-4 bg-blue-100 text-blue-700 border-none">Demand Engage</Badge>
                <h3 className="text-2xl font-bold mb-3">Email Agents</h3>
                <p className="text-muted-foreground mb-6">
                  AI trained on 10+ years of B2B email campaigns. Knows what subject lines convert, what copy resonates, and when to follow up.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-500" />
                    <span className="text-sm">Subject line optimization</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-500" />
                    <span className="text-sm">Persona-specific copy generation</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-500" />
                    <span className="text-sm">Sequence timing intelligence</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-500" />
                    <span className="text-sm">A/B variant generation</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Research & Reasoning Agents */}
            <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-lg">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-emerald-500 flex items-center justify-center mb-6">
                  <Brain className="h-7 w-7 text-white" />
                </div>
                <Badge className="mb-4 bg-emerald-100 text-emerald-700 border-none">Demand Intel</Badge>
                <h3 className="text-2xl font-bold mb-3">Research & Reasoning</h3>
                <p className="text-muted-foreground mb-6">
                  Deep account research + strategic reasoning. Gathers facts, verifies sources, then synthesizes into actionable messaging angles.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <span className="text-sm">Multi-source fact gathering</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <span className="text-sm">Buying signal detection</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <span className="text-sm">Problem-to-account matching</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <span className="text-sm">Strategic angle synthesis</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Content Creation Agents */}
            <Card className="border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-white shadow-lg">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-amber-500 flex items-center justify-center mb-6">
                  <PenTool className="h-7 w-7 text-white" />
                </div>
                <Badge className="mb-4 bg-amber-100 text-amber-700 border-none">Agentic Content</Badge>
                <h3 className="text-2xl font-bold mb-3">Content Creation</h3>
                <p className="text-muted-foreground mb-6">
                  Autonomous content generation for every touchpoint. From landing pages to call scripts — tailored to your ICP and messaging framework.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-amber-500" />
                    <span className="text-sm">Email template generation</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-amber-500" />
                    <span className="text-sm">Landing page copy</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-amber-500" />
                    <span className="text-sm">Call scripts & talk tracks</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-amber-500" />
                    <span className="text-sm">Objection response libraries</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Foundation Architecture Banner */}
          <Card className="mt-12 bg-slate-900 text-white border-none overflow-hidden">
            <CardContent className="p-8">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <Layers className="h-6 w-6 text-violet-400" />
                    <span className="text-sm font-bold uppercase tracking-wider text-violet-400">Foundation + Campaign Layer</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-4">
                    Agents that learn your organization.
                  </h3>
                  <p className="text-slate-400 mb-6">
                    Every agent inherits your Organization Intelligence — positioning, ICP, problem framework, and compliance policy. Then each campaign adds its own context layer for precision.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Badge className="bg-white/10 border-white/20">Org Identity</Badge>
                    <Badge className="bg-white/10 border-white/20">Service Catalog</Badge>
                    <Badge className="bg-white/10 border-white/20">Problem Framework</Badge>
                    <Badge className="bg-white/10 border-white/20">Compliance Rules</Badge>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3 mb-2">
                      <Bot className="h-5 w-5 text-violet-400" />
                      <span className="font-semibold">Foundation Agent</span>
                    </div>
                    <p className="text-sm text-slate-400">Base capabilities: gatekeeper handling, right-party verification, objection detection</p>
                  </div>
                  <div className="p-4 rounded-xl bg-violet-500/20 border border-violet-500/30">
                    <div className="flex items-center gap-3 mb-2">
                      <Target className="h-5 w-5 text-violet-300" />
                      <span className="font-semibold">+ Campaign Context</span>
                    </div>
                    <p className="text-sm text-slate-300">Talking points, account briefing, success criteria, qualification rules</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Buying Committee Section */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <Badge className="mb-4 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
                Buying Committee Mapping
              </Badge>
              <h2 className="text-4xl font-bold mb-6">
                Know who's missing before you call.
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                AI maps the economic buyer, champion, technical evaluator, and influencer for each account. Shows committee completeness. Suggests next best action based on what's missing.
              </p>

              <div className="space-y-4">
                {[
                  { role: "Economic Buyer", status: "mapped", name: "Sarah Thompson, CFO" },
                  { role: "Champion", status: "mapped", name: "Mark Wilson, VP Ops" },
                  { role: "Technical Evaluator", status: "missing", name: "Role not identified" },
                  { role: "Influencer", status: "mapped", name: "David Chen, Director" },
                ].map((item, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-4 rounded-xl border ${
                      item.status === "missing"
                        ? "border-dashed border-slate-300 bg-slate-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        item.status === "missing" ? "bg-slate-200" : "bg-blue-50"
                      }`}>
                        <Users className={`h-5 w-5 ${
                          item.status === "missing" ? "text-slate-400" : "text-blue-500"
                        }`} />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          {item.role}
                        </p>
                        <p className={`font-medium ${
                          item.status === "missing" ? "text-slate-400" : "text-slate-900"
                        }`}>
                          {item.name}
                        </p>
                      </div>
                    </div>
                    {item.status === "mapped" ? (
                      <Badge className="bg-emerald-50 text-emerald-600 border-none">Verified</Badge>
                    ) : (
                      <Badge variant="outline" className="border-dashed">Action Needed</Badge>
                    )}
                  </div>
                ))}
              </div>

              <Card className="mt-6 bg-slate-900 text-white border-none">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Next Best Action
                    </span>
                  </div>
                  <p className="text-sm">
                    Identify the technical evaluator to unlock the "High-Touch Technical" strategy variant.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-primary/20 rounded-3xl blur-3xl" />
              <Card className="relative bg-slate-900 text-white border-none shadow-2xl">
                <CardContent className="p-8">
                  <div className="flex items-center gap-2 mb-6">
                    <Brain className="h-5 w-5 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      Strategic Directive
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold mb-4">The Efficiency Play</h3>
                  <p className="text-slate-400 mb-6">
                    This account shows strong indicators of tech-debt in their current CX stack. Focus messaging on the "efficiency gap" and use Case Study A as primary proof-point.
                  </p>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-6">
                    <p className="text-sm font-medium text-slate-300 mb-2">Recommended Opener</p>
                    <p className="text-white italic">
                      "I noticed you're scaling the DevOps team after the recent funding. Usually, at this stage, cloud costs start to outpace headcount..."
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge className="bg-white/10 border-white/20">Email</Badge>
                    <Badge className="bg-white/10 border-white/20">AI Follow-up</Badge>
                    <Badge className="bg-white/10 border-white/20">Call Script Ready</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Campaign Types Section */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
              Campaign Types
            </Badge>
            <h2 className="text-4xl font-bold mb-4">
              Every B2B demand gen play. One platform.
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              From content syndication to BANT qualification — we run the campaigns that fill enterprise pipelines.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Content & Events */}
            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-blue-500" />
                </div>
                <h3 className="font-bold text-lg mb-2">Content Syndication</h3>
                <p className="text-sm text-muted-foreground">Engage ideal buyers with gated content and obtain opt-in consent at scale.</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-xl bg-violet-50 flex items-center justify-center mb-4">
                  <Video className="h-6 w-6 text-violet-500" />
                </div>
                <h3 className="font-bold text-lg mb-2">Webinar Programs</h3>
                <p className="text-sm text-muted-foreground">Drive live and on-demand webinar attendance with targeted outreach.</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
                  <Calendar className="h-6 w-6 text-amber-500" />
                </div>
                <h3 className="font-bold text-lg mb-2">Executive Events</h3>
                <p className="text-sm text-muted-foreground">Executive dinners, leadership forums, and conference meeting programs.</p>
              </CardContent>
            </Card>

            {/* Lead Generation */}
            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
                  <UserCheck className="h-6 w-6 text-emerald-500" />
                </div>
                <h3 className="font-bold text-lg mb-2">Appointment Generation</h3>
                <p className="text-sm text-muted-foreground">Secure qualified sales appointments directly on your team's calendar.</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-xl bg-rose-50 flex items-center justify-center mb-4">
                  <Target className="h-6 w-6 text-rose-500" />
                </div>
                <h3 className="font-bold text-lg mb-2">Sales Qualified Leads</h3>
                <p className="text-sm text-muted-foreground">Identify sales-ready leads with verified buying intent and authority.</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-xl bg-orange-50 flex items-center justify-center mb-4">
                  <BadgeCheck className="h-6 w-6 text-orange-500" />
                </div>
                <h3 className="font-bold text-lg mb-2">BANT Qualification</h3>
                <p className="text-sm text-muted-foreground">Budget, Authority, Need, Timeline — verified through live conversations.</p>
              </CardContent>
            </Card>

            {/* Data & Qualification */}
            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-xl bg-cyan-50 flex items-center justify-center mb-4">
                  <ClipboardCheck className="h-6 w-6 text-cyan-500" />
                </div>
                <h3 className="font-bold text-lg mb-2">Lead Qualification</h3>
                <p className="text-sm text-muted-foreground">Gather intel and classify leads against your custom qualification criteria.</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
                  <Database className="h-6 w-6 text-slate-500" />
                </div>
                <h3 className="font-bold text-lg mb-2">Data Validation</h3>
                <p className="text-sm text-muted-foreground">Verify and enrich contact and account data for campaign accuracy.</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-indigo-500" />
                </div>
                <h3 className="font-bold text-lg mb-2">High-Quality Leads</h3>
                <p className="text-sm text-muted-foreground">Leads meeting strict quality criteria with multi-touch verification.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* AI Voice Agents Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
              AI Voice Agents
            </Badge>
            <h2 className="text-4xl font-bold mb-4">
              AI agents that actually pick up the phone.
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Not chatbots. Real voice agents powered by Gemini Live that navigate gatekeepers, verify decision-makers, handle objections, and qualify leads using your BANT criteria.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-none shadow-lg">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-6">
                  <Phone className="h-7 w-7 text-blue-500" />
                </div>
                <h3 className="text-xl font-bold mb-3">Gatekeeper Navigation</h3>
                <p className="text-muted-foreground">AI detects gatekeepers, uses context-aware openers, and routes to decision-makers without scripted responses.</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-6">
                  <MessageSquare className="h-7 w-7 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold mb-3">Live Objection Handling</h3>
                <p className="text-muted-foreground">Real-time objection detection with responses pulled from your Problem Framework — not generic rebuttals.</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6">
                  <Target className="h-7 w-7 text-emerald-500" />
                </div>
                <h3 className="text-xl font-bold mb-3">Instant Qualification</h3>
                <p className="text-muted-foreground">Call ends → transcribed → AI applies your natural language QA rules → lead scored in seconds.</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-12 bg-slate-900 text-white border-none">
            <CardContent className="p-8">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <h3 className="text-2xl font-bold mb-4">
                    Qualification rules in English, not forms.
                  </h3>
                  <p className="text-slate-400 mb-6">
                    Write rules like "Qualified if they asked about pricing AND have budget authority" — AI reads the transcript and applies them. No rigid dropdown forms. No missed nuance.
                  </p>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xs font-medium text-slate-500 mb-2">Example Rule</p>
                    <p className="text-white font-mono text-sm">
                      "If prospect mentioned timeline under 6 months AND didn't hard-object on budget → qualified"
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Call Duration", value: "4:32" },
                    { label: "Qualification Score", value: "87/100" },
                    { label: "Budget Authority", value: "Confirmed" },
                    { label: "Timeline", value: "Q2 2025" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                      <span className="text-slate-400">{item.label}</span>
                      <span className="font-bold text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Agentic CRM Operator Section */}
      <section className="py-20 px-6 bg-gradient-to-br from-violet-950 via-purple-900 to-fuchsia-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="max-w-7xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <Badge className="mb-4 bg-white/10 text-white border-white/20 hover:bg-white/10">
                Agentic CRM Operator
              </Badge>
              <h2 className="text-4xl font-bold mb-6">
                Talk to your CRM. It talks back.
              </h2>
              <p className="text-xl text-white/70 mb-8">
                Natural language + voice control for your entire demand gen operation. Ask questions, run analyses, execute multi-step campaigns — hands-free.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <Brain className="h-6 w-6 text-violet-400 mb-3" />
                  <p className="font-semibold mb-1">Natural Language</p>
                  <p className="text-sm text-white/60">Speak naturally, no syntax</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <Zap className="h-6 w-6 text-amber-400 mb-3" />
                  <p className="font-semibold mb-1">Autonomous Execution</p>
                  <p className="text-sm text-white/60">Self-executing multi-step tasks</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <Mic className="h-6 w-6 text-emerald-400 mb-3" />
                  <p className="font-semibold mb-1">Voice Control</p>
                  <p className="text-sm text-white/60">Hands-free operation</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <Shield className="h-6 w-6 text-blue-400 mb-3" />
                  <p className="font-semibold mb-1">Safe Actions</p>
                  <p className="text-sm text-white/60">Review before apply</p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 rounded-3xl blur-3xl" />
              <Card className="relative bg-slate-900/80 backdrop-blur border-white/10 shadow-2xl">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">Agentic Command Center</p>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs text-emerald-400">AI Agent Online</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="p-3 rounded-lg bg-violet-500/20 border border-violet-500/30">
                      <p className="text-sm text-white/80">"Show me my top 10 leads by conversion probability"</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <p className="text-sm text-white/80">"Analyze my sales pipeline and show me deals at risk"</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <p className="text-sm text-white/80">"How are my email campaigns performing this month?"</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <p className="text-xs text-emerald-400 font-medium mb-2">Recent Action</p>
                    <p className="text-sm text-white">Analyzed Q4 pipeline health — identified 12 stalled deals</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Global B2B Data Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1">
              <div className="grid grid-cols-2 gap-6">
                <Card className="border-slate-200 shadow-lg">
                  <CardContent className="p-6 text-center">
                    <Globe className="h-10 w-10 text-blue-500 mx-auto mb-4" />
                    <p className="text-4xl font-bold text-slate-900 mb-2">195+</p>
                    <p className="text-sm text-muted-foreground">Countries Covered</p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-lg">
                  <CardContent className="p-6 text-center">
                    <Database className="h-10 w-10 text-emerald-500 mx-auto mb-4" />
                    <p className="text-4xl font-bold text-slate-900 mb-2">500M+</p>
                    <p className="text-sm text-muted-foreground">B2B Contacts</p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-lg">
                  <CardContent className="p-6 text-center">
                    <Target className="h-10 w-10 text-amber-500 mx-auto mb-4" />
                    <p className="text-4xl font-bold text-slate-900 mb-2">98%</p>
                    <p className="text-sm text-muted-foreground">Email Accuracy</p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-lg">
                  <CardContent className="p-6 text-center">
                    <TrendingUp className="h-10 w-10 text-violet-500 mx-auto mb-4" />
                    <p className="text-4xl font-bold text-slate-900 mb-2">Weekly</p>
                    <p className="text-sm text-muted-foreground">Data Refresh</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <Badge className="mb-4 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
                Global B2B Data
              </Badge>
              <h2 className="text-4xl font-bold mb-6">
                Massive reach. Pinpoint precision.
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Access the world's B2B decision-makers with data that's verified, enriched, and refreshed weekly. Not just volume — accuracy that converts.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Multi-Source Verification</p>
                    <p className="text-sm text-muted-foreground">Every contact cross-verified against LinkedIn, company records, and email validation</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Tech Stack & Intent Signals</p>
                    <p className="text-sm text-muted-foreground">Know what they use, what they're researching, and when they're ready to buy</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Firmographic Precision</p>
                    <p className="text-sm text-muted-foreground">Filter by revenue, employee count, industry, geography, and 50+ other attributes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Multi-Channel Section */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
              Multi-Channel Activation
            </Badge>
            <h2 className="text-4xl font-bold mb-4">
              Intelligent campaigns that earn demand.
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Professional-grade voice, email, and digital campaigns — unified in one platform. Agentic execution with expert-level precision.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Phone,
                title: "Intelligent Voice",
                features: ["AI-powered conversations", "Gatekeeper navigation", "Real-time qualification"],
              },
              {
                icon: Mail,
                title: "Expert Email",
                features: ["Problem-matched messaging", "Engagement sequences", "Conversion optimization"],
              },
              {
                icon: Globe,
                title: "Digital Campaigns",
                features: ["Content syndication", "Webinar programs", "Event registration"],
              },
              {
                icon: Shield,
                title: "Controlled Execution",
                features: ["Compliance built-in", "Human oversight", "Quality assurance"],
              },
            ].map((item, i) => (
              <Card key={i} className="border-slate-200 hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mb-4">
                    <item.icon className="h-6 w-6 text-slate-700" />
                  </div>
                  <h3 className="font-bold mb-3">{item.title}</h3>
                  <ul className="space-y-2">
                    {item.features.map((feature, j) => (
                      <li key={j} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 10 Years Experience Section */}
      <section className="py-16 px-6 bg-slate-100 border-y">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <Award className="h-10 w-10 text-white" />
              </div>
              <div>
                <p className="text-4xl font-bold text-slate-900">10+ Years</p>
                <p className="text-lg text-muted-foreground">Frontline B2B Demand Generation</p>
              </div>
            </div>

            <div className="h-px lg:h-16 w-full lg:w-px bg-slate-300" />

            <div className="grid grid-cols-3 gap-8 text-center">
              <div>
                <p className="text-3xl font-bold text-slate-900">2M+</p>
                <p className="text-sm text-muted-foreground">Leads Generated</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">500+</p>
                <p className="text-sm text-muted-foreground">Enterprise Clients</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">40+</p>
                <p className="text-sm text-muted-foreground">Industries Served</p>
              </div>
            </div>
          </div>

          <p className="text-center mt-8 text-muted-foreground max-w-3xl mx-auto">
            DemandGentic.ai is built by Pivotal B2B — a team that's been in the trenches of B2B demand generation for over a decade. We didn't build theory. We built what actually works.
          </p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 via-transparent to-blue-600/10" />
        <div className="max-w-4xl mx-auto text-center relative">
          <Badge className="mb-6 bg-white/10 text-white border-white/20">
            Expert AI Demand Generation
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Start earning demand across every channel.
          </h2>
          <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
            Professional-grade AI agents for voice, email, and digital campaigns. See how expert intelligence turns accounts into pipeline.
          </p>

          {/* Channel Pills in CTA */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 border border-blue-500/30">
              <Phone className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium text-blue-300">AI Voice</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 border border-emerald-500/30">
              <Mail className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-300">Expert Email</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/20 border border-violet-500/30">
              <Globe className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-medium text-violet-300">Digital Campaigns</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-base h-12 px-8 bg-white text-slate-900 hover:bg-slate-100">
              Book a Demo
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="text-base h-12 px-8 border-white/20 text-white hover:bg-white/10">
              <Play className="mr-2 h-5 w-5" />
              Watch Overview
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img
              src="/demangent-logo.png"
              alt="DemandGentic.ai"
              className="h-6 w-auto"
            />
            <span className="font-semibold">DemandGentic.ai</span>
            <span className="text-muted-foreground">by Pivotal B2B</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Intelligent B2B demand generation platform
          </p>
        </div>
      </footer>
    </div>
  );
}
