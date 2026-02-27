import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Brain,
  Target,
  Users,
  Phone,
  Mail,
  ArrowRight,
  CheckCircle2,
  Zap,
  Search,
  Lightbulb,
  Play,
  ChevronRight,
  Sparkles,
  Globe,
  Database,
  Shield,
  TrendingUp,
  FileText,
  Calendar,
  UserCheck,
  PenTool,
  Bot,
  Layers,
  AlertTriangle,
  XCircle,
  Volume2,
  RefreshCw,
  CircleDot,
  Quote,
  Wand2,
  BookOpen,
  LayoutDashboard,
  Eye,
  ClipboardCheck,
  MessageSquare,
} from "lucide-react";
import {
  BRAND, TAGLINE, STATS,
  DATA_SECTION,
  CONTENT_STUDIO,
  PRINCIPLES,
  FOUNDER_QUOTES,
  FOOTER,
  PUBLIC_PAGES_MESSAGING,
} from "@shared/brand-messaging";

export default function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/5 border border-violet-500/10 shrink-0">
              <div className="relative flex items-center justify-center">
                <span className="font-bold text-sm text-violet-700 tracking-tighter">PB</span>
                <Sparkles className="h-2 w-2 text-blue-500 absolute -top-1 -right-1.5" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg leading-tight">{BRAND.company.parentBrand}</span>
              <span className="text-[10px] text-muted-foreground font-medium">Agentic Account-Based Marketing for B2B</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
            <a href="#capabilities" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Capabilities</a>
            <a href="#built-for-you" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">For Your Team</a>
            <a href="/resources-centre" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Resources</a>
            <a href="#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">About</a>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation("/client-portal/login")}>
              Client Login
            </Button>
            <Button onClick={() => setLocation("/book/admin/demo")} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
              Book a Live Strategy Session
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ─── HERO SECTION ─────────────────────────────────────────────── */}
      <section className="pt-32 pb-24 px-6 relative overflow-hidden perspective-1000">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-50 via-background to-blue-50" />
        <div className="absolute top-20 right-0 w-[800px] h-[800px] bg-gradient-to-br from-violet-500/10 to-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

        <div className="max-w-7xl mx-auto relative grid lg:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-left max-w-2xl"
          >
            <Badge className="mb-6 px-4 py-2 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 text-violet-700 border-violet-200/50 hover:bg-violet-500/10">
              <Sparkles className="h-3.5 w-3.5 mr-2" />
              {PUBLIC_PAGES_MESSAGING.category}
            </Badge>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
              <span className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent">
                {PUBLIC_PAGES_MESSAGING.headline}
              </span>
              <br />
              <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
                {PUBLIC_PAGES_MESSAGING.subHeadline}
              </span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mb-4 leading-relaxed font-medium">
              {PUBLIC_PAGES_MESSAGING.tagline}
            </p>

            <p className="text-base md:text-lg text-muted-foreground mb-8 leading-relaxed">
              {PUBLIC_PAGES_MESSAGING.valueProposition}
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" onClick={() => setLocation("/book/admin/demo")} className="text-base h-14 px-8 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/25 transition-all hover:scale-105">
                Book a Live Strategy Session
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="text-base h-14 px-8 border-2 transition-all hover:scale-105" onClick={() => {
                document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
              }}>
                <Play className="mr-2 h-5 w-5" />
                See Platform Walkthrough
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {[
                "Enterprise-ready governance",
                "Voice + email + workflow orchestration",
                "Reasoning-first AI with full audit trail",
              ].map((pill, i) => (
                <Badge key={i} variant="outline" className="bg-white/60 backdrop-blur-sm border-violet-200 text-violet-800">
                  {pill}
                </Badge>
              ))}
            </div>
          </motion.div>

          {/* 3D Animated Visualization */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, rotateY: 20 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
            className="relative h-[600px] hidden lg:block perspective-1000"
          >
            <div className="absolute inset-0 flex items-center justify-center transform-style-3d">
              {/* Central Core */}
              <motion.div 
                animate={{ 
                  rotateY: [0, 360],
                  rotateX: [10, -10, 10]
                }}
                transition={{ 
                  rotateY: { duration: 20, repeat: Infinity, ease: "linear" },
                  rotateX: { duration: 5, repeat: Infinity, ease: "easeInOut" }
                }}
                className="relative w-64 h-64 transform-style-3d"
              >
                {/* Core Sphere/Glow */}
                <div className="absolute inset-0 bg-gradient-to-tr from-violet-600 to-indigo-500 rounded-full blur-2xl opacity-40 animate-pulse" />
                
                {/* Floating Cards */}
                {[
                  { icon: Brain, title: "Intelligence", color: "violet", delay: 0, z: 100, x: -80, y: -80 },
                  { icon: Phone, title: "Voice AI", color: "amber", delay: 0.2, z: 150, x: 80, y: -40 },
                  { icon: Wand2, title: "Content", color: "emerald", delay: 0.4, z: 80, x: -60, y: 80 },
                  { icon: Target, title: "Orchestration", color: "blue", delay: 0.6, z: 120, x: 60, y: 60 },
                ].map((card, i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      y: [card.y, card.y - 20, card.y],
                      rotateZ: [-2, 2, -2]
                    }}
                    transition={{ 
                      duration: 4, 
                      repeat: Infinity, 
                      ease: "easeInOut",
                      delay: card.delay 
                    }}
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 bg-white/90 backdrop-blur-xl border border-white/50 rounded-2xl p-4 shadow-2xl shadow-${card.color}-500/20`}
                    style={{
                      transform: `translate3d(${card.x}px, ${card.y}px, ${card.z}px)`,
                    }}
                  >
                    <div className={`h-10 w-10 rounded-xl bg-${card.color}-100 flex items-center justify-center mb-3`}>
                      <card.icon className={`h-5 w-5 text-${card.color}-600`} />
                    </div>
                    <div className="font-bold text-sm text-slate-800">{card.title}</div>
                    <div className="h-1.5 w-1/2 bg-slate-200 rounded-full mt-2" />
                    <div className="h-1.5 w-3/4 bg-slate-200 rounded-full mt-1.5" />
                  </motion.div>
                ))}

                {/* Connecting Lines (SVG) */}
                <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" style={{ transform: 'translateZ(50px)' }}>
                  <motion.circle 
                    cx="128" cy="128" r="100" 
                    fill="none" stroke="url(#grad1)" strokeWidth="2" strokeDasharray="4 4"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    style={{ transformOrigin: 'center' }}
                  />
                  <motion.circle 
                    cx="128" cy="128" r="140" 
                    fill="none" stroke="url(#grad2)" strokeWidth="1" strokeDasharray="8 8"
                    animate={{ rotate: -360 }}
                    transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                    style={{ transformOrigin: 'center' }}
                  />
                  <defs>
                    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.5" />
                    </linearGradient>
                    <linearGradient id="grad2" x1="100%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.3" />
                    </linearGradient>
                  </defs>
                </svg>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── FEATURED INTELLIGENCE SYSTEMS ─────────────────────────── */}
      <section className="py-24 px-6 bg-white" id="featured-intelligence">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <Badge className="mb-4 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50">
              <CircleDot className="h-3.5 w-3.5 mr-2" />
              Featured Intelligence Systems
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-5">
              The Systems That Power
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent"> Revenue-Grade Execution</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              These are the platform intelligence systems we recommend showcasing in demos, proposals, and buyer conversations—including Queue Scoring with AI and your Organization-Exclusive AI layer.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: "Problem Intelligence Layer",
                description: "Maps account-level context and buying-committee signals before outreach begins.",
                proof: "Show account context changing messaging direction before first touchpoint.",
                color: "violet",
              },
              {
                icon: Phone,
                title: "Real-Time AI Voice System",
                description: "Runs live conversational calls with function-driven actions and structured disposition capture.",
                proof: "Show one call lifecycle from initiation to disposition logged.",
                color: "amber",
              },
              {
                icon: LayoutDashboard,
                title: "Queue Scoring with AI",
                description: "Prioritizes queue items using account, contact, and intent-quality signals for smarter call and outreach sequencing.",
                proof: "Show queue rank changes based on scoring signals and campaign rules.",
                scoringFactors: [
                  { label: "ICP fit", weight: "35%" },
                  { label: "Intent/engagement", weight: "25%" },
                  { label: "Data quality", weight: "20%" },
                  { label: "Timing/readiness", weight: "20%" },
                ],
                color: "indigo",
              },
              {
                icon: Shield,
                title: "Compliance & Suppression Intelligence",
                description: "Applies policy-aware gating for calls and emails to reduce legal and brand risk.",
                proof: "Show a suppressed target blocked automatically.",
                color: "emerald",
              },
              {
                icon: TrendingUp,
                title: "QA + Revenue Intelligence Loop",
                description: "Combines quality scoring, disposition quality, and pipeline signals for continuous optimization.",
                proof: "Show quality signal to optimization feedback in one campaign cycle.",
                color: "blue",
              },
              {
                icon: Wand2,
                title: "Organization-Exclusive AI Studio",
                description: "Generates and refines campaign assets on an organization-specific intelligence layer with brand constraints and approval-aware workflows.",
                proof: "Show org-specific draft → refine → publish-ready output in one pass.",
                color: "rose",
              },
            ].map((item, i) => (
              <Card key={i} className="border-2 hover:shadow-xl transition-all hover:-translate-y-1 bg-white">
                <CardContent className="p-6">
                  <div className={`h-12 w-12 rounded-xl bg-${item.color}-100 flex items-center justify-center mb-4`}>
                    <item.icon className={`h-6 w-6 text-${item.color}-600`} />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{item.description}</p>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-xs font-medium text-slate-700">Demo proof: {item.proof}</p>
                  </div>
                  {item.title === "Queue Scoring with AI" && (
                    <div className="mt-3 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                      <p className="text-xs font-semibold text-indigo-700 mb-2 uppercase tracking-wide">Example scoring factors</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(item as any).scoringFactors?.map((factor: { label: string; weight: string }, idx: number) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-white border border-indigo-100 rounded px-2 py-1.5">
                            <span className="text-slate-700">{factor.label}</span>
                            <span className="font-semibold text-indigo-700">{factor.weight}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── MARKET REALITY / REFRAME ─────────────────────────────────── */}
      <section className="py-24 px-6 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/10">
              <AlertTriangle className="h-3.5 w-3.5 mr-2" />
              The Shift
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Traditional demand generation optimizes for{" "}
              <span className="text-red-400">volume.</span>
              <br />
              ABM wins with{" "}
              <span className="text-emerald-400">precision.</span>
            </h2>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto">
              DemandGentic is built for the reality of modern B2B buying: committees, long cycles,
              strict compliance, and brand risk.
            </p>
          </div>

          {/* Outcomes */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6">
                  <Calendar className="h-7 w-7 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">More Qualified Meetings</h3>
                <p className="text-slate-400">
                  Create more qualified meetings in target accounts with coordinated,
                  reasoning-first outreach across voice, email, and contextual follow-up.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6">
                  <Users className="h-7 w-7 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">Multi-Thread Buying Committees</h3>
                <p className="text-slate-400">
                  Engage buying committees with role-aware messaging, stakeholder-level memory,
                  and orchestration across every key contact in the account.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-6">
                  <Shield className="h-7 w-7 text-violet-400" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">Scale with Governance</h3>
                <p className="text-slate-400">
                  Scale execution with compliance controls, approvals, suppression safeguards,
                  and full traceability at every step of the process.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ─── PIPELINE PROTECTION ──────────────────────────────────────── */}
      <section className="py-24 px-6 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10">
              <Shield className="h-3.5 w-3.5 mr-2" />
              Pipeline Protection
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-2">
              {PUBLIC_PAGES_MESSAGING.pipelineProtection.headline}
            </h2>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              <span className="text-emerald-400">{PUBLIC_PAGES_MESSAGING.pipelineProtection.subHeadline}</span>
            </h2>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-8">
              {PUBLIC_PAGES_MESSAGING.pipelineProtection.description}
            </p>
            <p className="text-lg text-slate-300 max-w-3xl mx-auto">
              {PUBLIC_PAGES_MESSAGING.pipelineProtection.resolution}
            </p>
          </div>

          {/* Precision Statement */}
          <div className="p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur text-center">
            <p className="text-2xl md:text-3xl font-bold">
              <span className="text-slate-400">{PUBLIC_PAGES_MESSAGING.precisionStatement.contrast}</span>{" "}
              <span className="bg-gradient-to-r from-violet-400 to-emerald-400 bg-clip-text text-transparent">
                {PUBLIC_PAGES_MESSAGING.precisionStatement.assertion}
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* ─── WHAT DEMANDGENTIC IS ─────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden" id="platform">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-white" />

        <div className="max-w-5xl mx-auto relative text-center">
          <Badge className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
            <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
            What DemandGentic Is
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            A Reasoning-First{" "}
            <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              Agentic System
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            A reasoning-first agentic system that plans and executes ABM plays—guided by your
            team's strategy and constrained by your brand, rules, and approvals.
          </p>

          {/* One-liner definition */}
          <div className="inline-block p-6 rounded-2xl bg-violet-50 border border-violet-200">
            <div className="flex items-center gap-3 justify-center mb-2">
              <Lightbulb className="h-5 w-5 text-violet-600" />
              <span className="text-sm font-bold uppercase tracking-wider text-violet-600">Reasoning-First Defined</span>
            </div>
            <p className="text-lg text-violet-900 font-medium max-w-2xl">
              Every action is justified before it runs—and can be reviewed after it happens.
            </p>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-slate-50" id="how-it-works">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-200">
              How It Works
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Three Layers.{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">One System.</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Human strategy, agentic execution, and persistent memory—working together under your control.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Layer 1 */}
            <Card className="border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white shadow-xl shadow-violet-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl" />
              <CardContent className="p-8 relative">
                <div className="text-xs font-bold uppercase tracking-wider text-violet-500 mb-4">Layer 01</div>
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center mb-5 shadow-lg shadow-violet-500/25">
                  <Users className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3">Human-Led Strategy Layer</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Problem intelligence → solution mapping → organizational context, before automation.
                </p>
                <ul className="space-y-2">
                  {["ICP & account strategy", "Solution-to-problem mapping", "Brand & compliance guardrails"].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="h-4 w-4 text-violet-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Layer 2 */}
            <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white shadow-xl shadow-indigo-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl" />
              <CardContent className="p-8 relative">
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-4">Layer 02</div>
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center mb-5 shadow-lg shadow-indigo-500/25">
                  <Brain className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3">Agentic Execution Layer</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Purpose-built agents research, call, email, score, and follow up across channels—coordinated under one system.
                </p>
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                  <p className="text-xs font-medium text-indigo-900">
                    The Agentic Demand Council — every move reasoned, every action accountable.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Layer 3 */}
            <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-xl shadow-emerald-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
              <CardContent className="p-8 relative">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-500 mb-4">Layer 03</div>
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/25">
                  <Database className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3">Memory + Accountability</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Account/contact memory, quality telemetry, and audit logs keep every interaction consistent and measurable.
                </p>
                <ul className="space-y-2">
                  {["No scattered tools", "No lost context", "Full audit & score trail"].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ─── CORE CAPABILITIES (4 PILLARS) ────────────────────────────── */}
      <section className="py-24 px-6" id="capabilities">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50">
              Core Capabilities
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Four Pillars of{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Precision ABM</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Pillar 1 */}
            <Card className="border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white shadow-xl shadow-violet-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl" />
              <CardContent className="p-8 relative">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center mb-5 shadow-lg shadow-violet-500/25">
                  <Search className="h-7 w-7 text-white" />
                </div>
                <Badge className="mb-3 bg-violet-100 text-violet-700 border-none">Intelligence</Badge>
                <h3 className="text-2xl font-bold mb-3">Account & Buying Committee Intelligence</h3>
                <p className="text-muted-foreground mb-4">
                  Research, roles, triggers, and context to inform messaging and plays.
                </p>
                <ul className="space-y-2">
                  {["Buying committee mapping", "Trigger event detection", "Account-level research briefs"].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-violet-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Pillar 2 */}
            <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white shadow-xl shadow-indigo-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl" />
              <CardContent className="p-8 relative">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center mb-5 shadow-lg shadow-indigo-500/25">
                  <Zap className="h-7 w-7 text-white" />
                </div>
                <Badge className="mb-3 bg-indigo-100 text-indigo-700 border-none">Orchestration</Badge>
                <h3 className="text-2xl font-bold mb-3">Reasoning-First Outreach Orchestration</h3>
                <p className="text-muted-foreground mb-4">
                  Conversational voice, intelligent email sequencing, and workflow automation coordinated with compliance-first behavior.
                </p>
                <ul className="space-y-2">
                  {["Multi-channel coordination", "Real-time call & email actions", "Contextual follow-up sequencing"].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-indigo-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Pillar 3 */}
            <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-xl shadow-emerald-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
              <CardContent className="p-8 relative">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/25">
                  <Wand2 className="h-7 w-7 text-white" />
                </div>
                <Badge className="mb-3 bg-emerald-100 text-emerald-700 border-none">Content</Badge>
                <h3 className="text-2xl font-bold mb-3">Brand-Exclusive Content Studio</h3>
                <p className="text-muted-foreground mb-4">
                  Landing pages, emails, briefs, blogs, eBooks—generated in your voice with your
                  structure, guardrails, and approvals.
                </p>
                <ul className="space-y-2">
                  {["Your brand voice & guidelines", "Full approval workflows", "One-click publishing"].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Pillar 4 */}
            <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-xl shadow-blue-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />
              <CardContent className="p-8 relative">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-5 shadow-lg shadow-blue-500/25">
                  <TrendingUp className="h-7 w-7 text-white" />
                </div>
                <Badge className="mb-3 bg-blue-100 text-blue-700 border-none">Quality + Governance</Badge>
                <h3 className="text-2xl font-bold mb-3">Quality, Compliance & Revenue Intelligence</h3>
                <p className="text-muted-foreground mb-4">
                  Real-time QA and governance controls with revenue intelligence loops to continuously improve targeting and outcomes.
                </p>
                <ul className="space-y-2">
                  {["Automated QA scoring", "Suppression & compliance controls", "Pipeline and performance analytics"].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-blue-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ─── THE AGENTIC DEMAND COUNCIL & ORGANIZATION EXCLUSIVE AI STUDIO ── */}
      <section className="py-24 px-6 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

        <div className="max-w-7xl mx-auto relative">
          {/* ── Header ── */}
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/10">
              <Bot className="h-3.5 w-3.5 mr-2" />
              The Agentic Demand Council & Organization Exclusive AI Studio
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Purpose-Built Agents.{" "}
              <span className="text-violet-400">Your Exclusive AI Studio.</span>
            </h2>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto">
              This section is the operating view: how specialized agents coordinate execution while your
              organization-exclusive AI layer preserves brand context, governance rules, and auditability.
            </p>
          </div>

          {/* ── Agent Cards ── */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {[
              {
                icon: Search,
                title: "Research Agent",
                subtitle: "Account Intelligence",
                description: "Autonomous research across accounts, roles, triggers, and buying signals to build actionable intelligence briefs.",
                capabilities: ["Multi-source verification", "Buying committee mapping", "Trigger event detection"],
                color: "emerald",
              },
              {
                icon: Phone,
                title: "Voice AI",
                subtitle: "Conversational Outreach",
                description: "AI that conducts real phone conversations with natural speech, real-time dispositioning, and optional human transfer when needed.",
                capabilities: ["Natural live conversations", "Function-driven call actions", "Real-time qualification"],
                color: "amber",
              },
              {
                icon: Mail,
                title: "Email Agent",
                subtitle: "Sequence Orchestration",
                description: "Persona-specific email sequences with contextual follow-up, compliance-safe templates, and reply sentiment intelligence.",
                capabilities: ["Persona-specific copy", "Sequence automation", "Reply sentiment analysis"],
                color: "blue",
              },
              {
                icon: Wand2,
                title: "Content Agent",
                subtitle: "Brand-Exclusive Studio",
                description: "Generates landing pages, emails, blogs, eBooks, and briefs—all in your brand voice with your structure and approvals.",
                capabilities: ["Your brand guidelines", "Full approval workflows", "One-click publishing"],
                color: "violet",
              },
              {
                icon: LayoutDashboard,
                title: "Pipeline Agent",
                subtitle: "Account Orchestration",
                description: "Manages account flow through pipeline stages, tracks buyer journeys, and surfaces next-best actions for teams.",
                capabilities: ["Account stage automation", "Buyer journey tracking", "AI scoring insights"],
                color: "indigo",
              },
              {
                icon: Shield,
                title: "QA Agent",
                subtitle: "Compliance & Quality",
                description: "Audits calls, messages, and outcomes for quality, accuracy, and compliance—ensuring every touchpoint meets your standards.",
                capabilities: ["Real-time monitoring", "Policy enforcement", "Disposition & audit controls"],
                color: "rose",
              },
            ].map((agent, i) => (
              <Card key={i} className="bg-white/5 border-white/10 backdrop-blur hover:bg-white/10 transition-colors">
                <CardContent className="p-6">
                  <div className={`h-12 w-12 rounded-xl bg-${agent.color}-500/20 flex items-center justify-center mb-4`}>
                    <agent.icon className={`h-6 w-6 text-${agent.color}-400`} />
                  </div>
                  <div className="mb-3">
                    <h3 className="font-bold text-lg text-white">{agent.title}</h3>
                    <p className={`text-sm text-${agent.color}-400`}>{agent.subtitle}</p>
                  </div>
                  <p className="text-sm text-slate-400 mb-4">{agent.description}</p>
                  <ul className="space-y-1.5">
                    {agent.capabilities.map((cap, j) => (
                      <li key={j} className="flex items-center gap-2 text-xs text-slate-300">
                        <CheckCircle2 className={`h-3 w-3 text-${agent.color}-400`} />
                        {cap}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── Organization Exclusive AI Studio (Condensed) ── */}
          <div className="mb-16 p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur">
            <div className="text-center mb-6">
              <div className="flex items-center gap-2 justify-center mb-3">
                <Wand2 className="h-5 w-5 text-violet-400" />
                <span className="text-sm font-bold uppercase tracking-wider text-violet-400">Organization Exclusive AI Studio</span>
              </div>
              <h3 className="text-2xl font-bold mb-3 text-white">Your AI Output Layer, Constrained by Your Rules</h3>
              <p className="text-slate-400 max-w-3xl mx-auto">{CONTENT_STUDIO.subheadline}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                "Generate campaign assets using organization-specific context",
                "Refine with human review and approval-aware edits",
                "Publish channel-ready outputs for voice, email, and landing workflows",
              ].map((item, i) => (
                <div key={i} className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-slate-300 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-violet-400 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Council Summary ── */}
          <div className="p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="h-5 w-5 text-violet-400" />
                  <span className="text-sm font-bold uppercase tracking-wider text-violet-400">Coordinated Under One System</span>
                </div>
                <h3 className="text-2xl font-bold mb-4 text-white">Every Agent Shares Memory. Every Action Is Reasoned.</h3>
                <p className="text-slate-400">
                  Account and contact memory keeps every interaction consistent, contextual, and measurable
                  across all agents. No scattered tools. No lost context. Full traceability.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center md:justify-end">
                {["Reasoning First", "Shared Memory", "Compliance Built-In", "Brand Governed", "Full Audit Trail", "Exclusive AI Studio"].map((item, i) => (
                  <Badge key={i} className="bg-white/10 border-white/20 text-white">{item}</Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── DATA & INTELLIGENCE ─────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden" id="data">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-white" />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
              <Database className="h-3.5 w-3.5 mr-2" />
              Data & Intelligence
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">{DATA_SECTION.headline}</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">{DATA_SECTION.subheadline}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
            {[
              { icon: Users, number: STATS.verifiedContacts, label: "Verified B2B Contacts", sublabel: "Decision-makers across every industry", color: "violet" },
              { icon: Globe, number: STATS.countriesCovered, label: "Countries Covered", sublabel: "True global reach for campaigns", color: "blue" },
              { icon: Target, number: STATS.emailAccuracy, label: "Email Accuracy", sublabel: "Real-time verification before send", color: "emerald" },
              { icon: RefreshCw, number: STATS.dataRefresh, label: "Data Refresh", sublabel: "Continuous hygiene eliminates decay", color: "amber" },
            ].map((stat, i) => (
              <Card key={i} className="border-2 hover:shadow-xl transition-all hover:-translate-y-1 bg-white text-center">
                <CardContent className="p-6">
                  <div className={`h-14 w-14 rounded-2xl bg-${stat.color}-100 flex items-center justify-center mx-auto mb-4`}>
                    <stat.icon className={`h-7 w-7 text-${stat.color}-600`} />
                  </div>
                  <div className="text-3xl font-bold mb-1">{stat.number}</div>
                  <div className="font-semibold text-sm mb-1">{stat.label}</div>
                  <div className="text-xs text-muted-foreground">{stat.sublabel}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Data Capabilities */}
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {[
              { icon: CheckCircle2, title: "Verification Engine", description: "Every contact verified against multiple sources before entering your campaign. Real-time bounce prediction ensures deliverability.", color: "emerald" },
              { icon: Database, title: "Enrichment & Hygiene", description: "Continuous data enrichment adds firmographics, technographics, and intent signals. Weekly refresh eliminates decay before it impacts results.", color: "blue" },
              { icon: Search, title: "Intelligence Layer", description: "AI-driven research briefs, buying signals, and competitive intelligence layered on top of verified contact data for precision targeting.", color: "violet" },
            ].map((cap, i) => (
              <Card key={i} className="border hover:shadow-lg transition-all bg-white">
                <CardContent className="p-8">
                  <div className={`h-12 w-12 rounded-xl bg-${cap.color}-100 flex items-center justify-center mb-4`}>
                    <cap.icon className={`h-6 w-6 text-${cap.color}-600`} />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{cap.title}</h3>
                  <p className="text-sm text-muted-foreground">{cap.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Data Promise */}
          <div className="p-8 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-center">
            <div className="flex items-center gap-2 justify-center mb-2">
              <Shield className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-bold uppercase tracking-wider text-blue-600">Our Data Promise</span>
            </div>
            <h3 className="text-2xl font-bold mb-2">{DATA_SECTION.promise.headline}</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">{DATA_SECTION.promise.description}</p>
          </div>
        </div>
      </section>

      {/* ─── SERVICES GRID ────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-slate-50" id="services">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50">
              <Layers className="h-3.5 w-3.5 mr-2" />
              Services
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Full-Stack{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                Demand Services
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Every service powered by reasoning-first AI, coordinated under one system, and governed by your brand.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Target, badge: "ABM", title: "AI-Led Account-Based Marketing", description: "Target, engage, and convert high-value accounts with intelligence-driven orchestration across email, voice, and content.", features: ["Buying committee mapping", "Cross-channel orchestration", "Account-level reasoning"], color: "violet" },
              { icon: Phone, badge: "Voice AI", title: "Autonomous Voice AI", description: "AI systems that make and receive real phone calls with natural conversation, live objection handling, and seamless meeting booking.", features: ["Live phone conversations", "Real-time qualification", "Gatekeeper navigation"], color: "amber" },
              { icon: Mail, badge: "Email Marketing", title: "Intelligent Email Marketing", description: "AI-crafted email campaigns with persona-specific sequences, smart send-time optimization, and reply sentiment analysis.", features: ["Persona-specific sequences", "Send-time optimization", "Reply sentiment analysis"], color: "sky" },
              { icon: Wand2, badge: "Content Studio", title: "Generative Content Creation", description: "A full AI-powered content studio that generates landing pages, email campaigns, blog posts, eBooks, solution briefs, and images — all in your brand voice.", features: ["7 content generation engines", "One-click publishing", "AI-powered refinement"], color: "emerald" },
              { icon: Bot, badge: "AI SDR", title: "AI SDR-as-a-Service", description: "Autonomous AI systems conduct first-touch outreach, qualification, follow-ups, and meeting booking across voice and email.", features: ["24/7 autonomous engagement", "Human-in-the-loop escalation", "Campaign-level guardrails"], color: "blue" },
              { icon: LayoutDashboard, badge: "Pipeline", title: "Intelligent Pipeline Management", description: "Manage your entire top-of-funnel with AI-driven account staging, buyer journey tracking, and actionable revenue intelligence.", features: ["AI account scoring", "Buyer journey stages", "Revenue intelligence signals"], color: "indigo" },
              { icon: Calendar, badge: "Appointments", title: "Qualified Appointment Generation", description: "We deliver BANT-qualified sales appointments directly to your team's calendar through multi-channel outreach.", features: ["Full top-of-funnel management", "Multi-channel outreach", "No-show follow-up"], color: "rose" },
              { icon: Search, badge: "Intelligence", title: "Market & Account Intelligence", description: "Deep research, enrichment, and analysis of accounts and industries to power better GTM decisions.", features: ["ICP refinement", "Competitive landscape", "Buying signal detection"], color: "cyan" },
              { icon: Database, badge: "Data", title: "B2B Data & Enrichment", description: "Access our 70M+ verified contact database or enrich your existing data with our verification and hygiene engine.", features: ["Custom list building", "Multi-source verification", "Continuous hygiene"], color: "slate" },
            ].map((service, i) => (
              <Card key={i} className="border-2 hover:shadow-xl transition-all hover:-translate-y-1 bg-white">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`h-12 w-12 rounded-xl bg-${service.color}-100 flex items-center justify-center shrink-0`}>
                      <service.icon className={`h-6 w-6 text-${service.color}-600`} />
                    </div>
                    <Badge className={`bg-${service.color}-50 text-${service.color}-700 border-${service.color}-200`}>
                      {service.badge}
                    </Badge>
                  </div>
                  <h3 className="text-lg font-bold mb-2">{service.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{service.description}</p>
                  <ul className="space-y-1.5">
                    {service.features.map((feature, j) => (
                      <li key={j} className="flex items-center gap-2 text-xs text-slate-600">
                        <CheckCircle2 className={`h-3 w-3 text-${service.color}-500`} />
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

      {/* ─── MID-PAGE CTA ───────────────────────────────────────────── */}
      <section className="py-16 px-6 bg-white border-y">
        <div className="max-w-5xl mx-auto text-center">
          <h3 className="text-3xl md:text-4xl font-bold mb-3">
            Ready to operationalize agentic ABM in your current GTM stack?
          </h3>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto mb-8">
            Get a practical walkthrough of how DemandGentic fits your workflow, governance model, and pipeline goals.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => setLocation("/book/admin/demo")} className="text-base h-12 px-7 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
              Book a Live Strategy Session
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="text-base h-12 px-7" onClick={() => setLocation("/proposal-request")}>
              Request a Proposal
            </Button>
          </div>
        </div>
      </section>

      {/* ─── ENTERPRISE READINESS / PROOF ───────────────────────────── */}
      <section className="py-24 px-6 bg-slate-50" id="enterprise-proof">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <Badge className="mb-4 bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50">
              <ClipboardCheck className="h-3.5 w-3.5 mr-2" />
              Enterprise Readiness
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-5">
              Built for Complex B2B Revenue Environments
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Deploy agentic ABM with practical controls for multi-stakeholder teams, governed execution, and measurable rollout.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-2 bg-white">
              <CardContent className="p-7">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-5 w-5 text-violet-600" />
                  <h3 className="font-bold text-lg">Who It's For</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {[
                    "B2B vendors with multi-thread buying journeys",
                    "Demand Gen + RevOps teams managing complex funnels",
                    "Sales organizations requiring quality-controlled pipeline",
                    "Leaders needing enterprise governance and auditability",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-violet-500 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 bg-white">
              <CardContent className="p-7">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-bold text-lg">High-Impact Use Cases</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {[
                    "Launch net-new ABM programs with faster signal-to-meeting cycles",
                    "Recover underperforming outbound through reasoning-first sequencing",
                    "Improve pipeline quality with role-aware, account-level orchestration",
                    "Scale top-of-funnel without sacrificing compliance or brand control",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-indigo-500 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 bg-white">
              <CardContent className="p-7">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-bold text-lg">Security, Compliance, Governance</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {[
                    "Suppression-aware execution and policy-aligned outreach",
                    "Approval controls for sensitive messaging and campaigns",
                    "Full interaction traceability with audit-ready records",
                    "Quality scoring loops to improve campaign integrity over time",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 bg-white">
              <CardContent className="p-7">
                <div className="flex items-center gap-2 mb-3">
                  <ChevronRight className="h-5 w-5 text-blue-600" />
                  <h3 className="font-bold text-lg">Implementation Path</h3>
                </div>
                <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                  <li>Align ICP, success criteria, and governance controls.</li>
                  <li>Activate agentic voice/email workflows with human oversight.</li>
                  <li>Run in-market, score quality, and tune continuously.</li>
                  <li>Scale proven motions across teams and regions.</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ─── PHILOSOPHY / PRINCIPLES ──────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white to-slate-50" />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50">
              <Brain className="h-3.5 w-3.5 mr-2" />
              Our Principles
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              {TAGLINE.identity}:{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                Our Philosophy
              </span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            {PRINCIPLES.map((principle, i) => {
              const icons: Record<string, any> = { Brain, Database, Shield, UserCheck };
              const PrincipleIcon = icons[principle.iconName] || Brain;
              const colors = ["violet", "indigo", "emerald", "blue"];
              const color = colors[i % colors.length];
              return (
                <Card key={i} className="border-2 hover:shadow-xl transition-all hover:-translate-y-1 bg-white">
                  <CardContent className="p-8 text-center">
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">{principle.number}</div>
                    <div className={`h-14 w-14 rounded-2xl bg-${color}-100 flex items-center justify-center mx-auto mb-5`}>
                      <PrincipleIcon className={`h-7 w-7 text-${color}-600`} />
                    </div>
                    <h3 className="text-lg font-bold mb-3">{principle.title}</h3>
                    <p className="text-sm text-muted-foreground">{principle.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Identity Banner */}
          <div className="p-8 rounded-2xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 text-center">
            <p className="text-2xl font-bold mb-2">
              We are{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                {TAGLINE.identity}
              </span>
            </p>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{TAGLINE.full}</p>
          </div>
        </div>
      </section>

      {/* ─── FOUNDER / ABOUT ──────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-slate-50" id="about">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50">
              <Quote className="h-3.5 w-3.5 mr-2" />
              Our Story
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Built by{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                {TAGLINE.identity}
              </span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 items-start">
            {/* Stats Sidebar */}
            <div className="space-y-4">
              {[
                { label: "Years of Experience", value: STATS.yearsExperience },
                { label: "B2B Leads Generated", value: STATS.leadsGenerated },
                { label: "Enterprise Clients", value: STATS.enterpriseClients },
                { label: "Industries Served", value: STATS.industriesServed },
                { label: "Global Campaigns", value: STATS.globalCampaigns },
              ].map((stat, i) => (
                <div key={i} className="p-4 rounded-xl bg-white border hover:shadow-md transition-shadow">
                  <div className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Founder Quote & Story */}
            <div className="md:col-span-2">
              <Card className="border-2 bg-white shadow-xl">
                <CardContent className="p-10">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                      <span className="text-2xl font-bold text-white">{BRAND.founder.initials}</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">{BRAND.founder.name}</h3>
                      <p className="text-sm text-muted-foreground">{BRAND.founder.title}</p>
                      <p className="text-xs text-muted-foreground">Founded in {BRAND.company.foundedLocation}, {BRAND.company.foundedYear}</p>
                    </div>
                  </div>

                  <blockquote className="relative mb-8">
                    <Quote className="h-8 w-8 text-violet-200 absolute -top-2 -left-2" />
                    <p className="text-lg text-muted-foreground italic pl-8 leading-relaxed">
                      {FOUNDER_QUOTES.landing}
                    </p>
                  </blockquote>

                  <div className="pt-6 border-t">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      From {BRAND.company.foundedLocation} to {BRAND.company.location}, Pivotal B2B has grown from a bootstrapped startup
                      into a reasoning-first demand generation platform serving enterprise B2B vendors worldwide.
                      With {STATS.yearsExperience} years of front-line experience, {STATS.leadsGenerated} leads generated,
                      and {STATS.enterpriseClients} enterprise clients, we've learned that every interaction counts—and
                      every interaction should be reasoned before it runs.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>




      {/* ─── WHAT WE DELIVER ───────────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden" id="built-for-you">
        <div className="absolute inset-0 bg-gradient-to-b from-white to-slate-50" />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50">
              <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
              What We Deliver
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Everything You Need for{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Precision ABM</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {[
              { icon: Users, title: PUBLIC_PAGES_MESSAGING.deliverables[0], color: "violet" },
              { icon: Brain, title: PUBLIC_PAGES_MESSAGING.deliverables[1], color: "indigo" },
              { icon: Zap, title: PUBLIC_PAGES_MESSAGING.deliverables[2], color: "blue" },
              { icon: Shield, title: PUBLIC_PAGES_MESSAGING.deliverables[3], color: "emerald" },
              { icon: Eye, title: PUBLIC_PAGES_MESSAGING.deliverables[4], color: "amber" },
              { icon: MessageSquare, title: PUBLIC_PAGES_MESSAGING.deliverables[5], color: "rose" },
            ].map((item, i) => (
              <Card key={i} className="border-2 hover:shadow-xl transition-all hover:-translate-y-1 bg-white">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className={`h-12 w-12 rounded-xl bg-${item.color}-100 flex items-center justify-center shrink-0`}>
                    <item.icon className={`h-6 w-6 text-${item.color}-600`} />
                  </div>
                  <p className="font-semibold text-sm pt-3">{item.title}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Built For section */}
          <div className="p-8 rounded-2xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold mb-2">Built For Your Team</h3>
              <p className="text-muted-foreground">Designed for the people who drive revenue.</p>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              {["CMOs & VP Marketing", "VP Sales & CROs", "Demand Gen Directors", "RevOps Leaders", "ABM Teams", "Sales Development Leaders", "Agency Owners", "Growth Leaders"].map((persona, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-violet-200 shadow-sm">
                  <CheckCircle2 className="h-4 w-4 text-violet-500" />
                  <span className="text-sm font-medium">{persona}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CLOSING STATEMENT ─────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-muted-foreground">{PUBLIC_PAGES_MESSAGING.closingStatement.contrast}</span>
          </h2>
          <h2 className="text-3xl md:text-4xl font-bold mb-8">
            <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              {PUBLIC_PAGES_MESSAGING.closingStatement.assertion}
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            <span className="font-semibold text-foreground">Human-Led Strategy</span> +{" "}
            <span className="font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              Agentic ABM Execution
            </span>
            —guided by your brand, constrained by your rules, built for what's next.
          </p>
        </div>
      </section>

      {/* ─── FINAL CTA ────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />

        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to launch reasoning-first ABM with measurable pipeline outcomes?
          </h2>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Button size="lg" onClick={() => setLocation("/book/admin/demo")} className="text-base h-14 px-8 bg-white text-violet-700 hover:bg-white/90 shadow-lg">
              Book a Live Strategy Session
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => setLocation("/proposal-request")} className="text-base h-14 px-8 border-white/50 text-white hover:bg-white/10">
              Request a Proposal
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 bg-slate-900 text-white">
        <div className="max-w-[1600px] mx-auto">
          <div className="grid md:grid-cols-5 gap-12 mb-12">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 border border-white/20 shrink-0">
                  <div className="relative flex items-center justify-center">
                    <span className="font-bold text-sm text-white tracking-tighter">PB</span>
                    <Sparkles className="h-2 w-2 text-blue-400 absolute -top-1 -right-1.5" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-lg leading-tight">{BRAND.company.parentBrand}</span>
                  <span className="text-[10px] text-slate-400 font-medium">{TAGLINE.full}</span>
                </div>
              </div>
              <p className="text-slate-400 text-sm mb-4">
                {TAGLINE.footerTagline}
              </p>
              <div className="text-slate-500 text-xs space-y-1">
                <p className="font-medium text-slate-400">{BRAND.company.legalName}</p>
                <p>{BRAND.company.location}</p>
                <p><a href="tel:+14179003844" className="hover:text-white transition-colors">{BRAND.company.phone}</a></p>
                <p><a href={`https://${BRAND.domains.primary}/`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">{BRAND.domains.primary}</a></p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#platform" className="hover:text-white transition-colors">AI Agents</a></li>
                <li><a href="#platform" className="hover:text-white transition-colors">Voice AI</a></li>
                <li><a href="#platform" className="hover:text-white transition-colors">Content Studio</a></li>
                <li><a href="#platform" className="hover:text-white transition-colors">Pipeline Intelligence</a></li>
                <li><a href="#data" className="hover:text-white transition-colors">Data & Intelligence</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Services</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#services" className="hover:text-white transition-colors">AI-Led ABM</a></li>
                <li><a href="#services" className="hover:text-white transition-colors">Conversational Voice AI</a></li>
                <li><a href="#services" className="hover:text-white transition-colors">Generative Content</a></li>
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
                <li><a href="/book/admin/demo" className="hover:text-white transition-colors">Schedule a Meeting</a></li>
                <li><a href="/proposal-request" className="hover:text-white transition-colors">Request a Proposal</a></li>
                <li><a href="/contact" className="hover:text-white transition-colors">Contact Us</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-sm">
              {FOOTER.copyright}
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
