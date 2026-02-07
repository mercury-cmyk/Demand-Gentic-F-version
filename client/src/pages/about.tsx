import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  Target,
  Users,
  ArrowRight,
  CheckCircle2,
  Zap,
  Sparkles,
  Globe,
  Shield,
  Award,
  TrendingUp,
  Heart,
  Compass,
  MapPin,
  Calendar,
  Rocket,
  Lightbulb,
  Quote,
  Mountain,
  Flag,
  Star,
  CircleDot,
  Play,
  ChevronRight,
} from "lucide-react";

export default function AboutPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setLocation("/welcome")}>
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
            <a href="/welcome#platform" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Platform</a>
            <a href="/welcome#services" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Services</a>
            <a href="/welcome#data" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Data</a>
            <span className="text-sm font-medium text-foreground">About</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation("/login")}>
              Sign In
            </Button>
            <Button onClick={() => setLocation("/login")} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
              Schedule Demo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-violet-950 to-indigo-950" />
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-violet-500/20 to-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-amber-500/10 to-orange-500/5 rounded-full blur-3xl" />

        {/* Subtle Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

        <div className="max-w-5xl mx-auto relative text-center">
          <Badge className="mb-6 px-4 py-2 bg-white/10 text-white border-white/20 hover:bg-white/10">
            <Mountain className="h-3.5 w-3.5 mr-2" />
            The Architect's Journey
          </Badge>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-white">
            From Kabul to the{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-400 bg-clip-text text-transparent">
              Cutting Edge of Agentic AI
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-slate-300 mb-8 leading-relaxed max-w-3xl mx-auto">
            A journey from one of the world's most complex environments to building
            technology that restores reasoning, trust, and human connection in B2B.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20">
              <MapPin className="h-4 w-4 text-amber-400" />
              <span className="text-sm text-white">Founded in Afghanistan, 2017</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20">
              <Globe className="h-4 w-4 text-blue-400" />
              <span className="text-sm text-white">Serving Global Markets</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20">
              <Brain className="h-4 w-4 text-violet-400" />
              <span className="text-sm text-white">Agentic AI Pioneer</span>
            </div>
          </div>
        </div>
      </section>

      {/* The Origin Story */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Visual Element */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 to-amber-500/20 rounded-3xl blur-3xl" />
              <div className="relative">
                {/* Main Card */}
                <Card className="bg-slate-900 text-white border-none shadow-2xl overflow-hidden">
                  <CardContent className="p-0">
                    {/* Top decorative bar */}
                    <div className="h-2 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-500" />

                    <div className="p-8">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-2xl font-bold">
                          ZM
                        </div>
                        <div>
                          <h3 className="text-xl font-bold">Zahid Mohammadi</h3>
                          <p className="text-slate-400">Founder & Chief AI Architect</p>
                        </div>
                      </div>

                      <div className="space-y-4 mb-6">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                            <Flag className="h-5 w-5 text-amber-400" />
                          </div>
                          <div>
                            <p className="font-medium">Origin</p>
                            <p className="text-sm text-slate-400">Kabul, Afghanistan</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                            <Rocket className="h-5 w-5 text-violet-400" />
                          </div>
                          <div>
                            <p className="font-medium">Mission</p>
                            <p className="text-sm text-slate-400">Steward of Progress</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <Brain className="h-5 w-5 text-blue-400" />
                          </div>
                          <div>
                            <p className="font-medium">Role</p>
                            <p className="text-sm text-slate-400">Chief AI Architect</p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-slate-700">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-2xl font-bold text-violet-400">10+</p>
                            <p className="text-xs text-slate-400">Years B2B</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-amber-400">100+</p>
                            <p className="text-xs text-slate-400">Global Campaigns</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-blue-400">2M+</p>
                            <p className="text-xs text-slate-400">Leads Generated</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Floating accent */}
                <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg transform rotate-6">
                  <Mountain className="h-10 w-10 text-white" />
                </div>
              </div>
            </div>

            {/* Right: Story Content */}
            <div>
              <Badge className="mb-4 bg-amber-50 text-amber-700 border-amber-200">The Beginning</Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                A Truth Forged in{" "}
                <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                  High-Stakes Environments
                </span>
              </h2>

              <div className="prose prose-lg text-muted-foreground">
                <p className="text-lg leading-relaxed mb-6">
                  In 2017, I founded Pivotal B2B in Kabul, Afghanistan. Operating in one of the world's
                  most complex and high-stakes environments taught me a singular, unshakeable truth:
                </p>

                <blockquote className="border-l-4 border-violet-500 pl-6 my-8 not-italic">
                  <p className="text-xl font-semibold text-slate-900">
                    "Technology is only as valuable as the integrity behind it."
                  </p>
                </blockquote>

                <p className="text-lg leading-relaxed mb-6">
                  In the physical world, I watched as resources were seized and communities were
                  marginalized because systems lacked a human-centric "Why." When I transitioned
                  into the role of Chief AI Architect, I saw the same patterns emerging in the
                  digital landscape:
                </p>

                <div className="flex flex-wrap gap-2 my-6">
                  <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 text-sm font-medium">
                    Unintelligent algorithms
                  </span>
                  <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 text-sm font-medium">
                    Creating noise
                  </span>
                  <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 text-sm font-medium">
                    Eroding trust
                  </span>
                </div>

                <p className="text-lg leading-relaxed">
                  The same patterns that marginalized communities in the physical world were now
                  marginalizing businesses in the digital one. I knew there had to be a better way.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Restoring the Human in the Loop */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-violet-50 text-violet-700 border-violet-200">
              <Heart className="h-3.5 w-3.5 mr-2" />
              The Philosophy
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Restoring the{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                "Human in the Loop"
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              I didn't build DemandGentic AI to simply "automate" sales. I built it to restore Reasoning.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {/* The Problem We Saw */}
            <Card className="border-2 border-slate-200 bg-white">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-red-50 flex items-center justify-center mb-6">
                  <Zap className="h-7 w-7 text-red-500" />
                </div>
                <h3 className="text-2xl font-bold mb-4">The Problem We Saw</h3>
                <p className="text-muted-foreground mb-6">
                  As humans, we are born with an innate capacity to solve problems — a state of
                  original innocence and curiosity. Today's algorithmic world often suppresses
                  that curiosity with:
                </p>
                <ul className="space-y-3">
                  {[
                    "Outrage Algorithms that optimize for clicks, not connection",
                    "Blind automation that scales noise instead of value",
                    "Systems that forget the human at the other end",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="h-5 w-5 rounded-full bg-red-100 flex items-center justify-center mt-0.5 shrink-0">
                        <span className="text-red-500 text-xs">✕</span>
                      </div>
                      <span className="text-slate-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* The Solution We Built */}
            <Card className="border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white">
              <CardContent className="p-8">
                <div className="h-14 w-14 rounded-2xl bg-violet-100 flex items-center justify-center mb-6">
                  <Brain className="h-7 w-7 text-violet-600" />
                </div>
                <h3 className="text-2xl font-bold mb-4">The Solution We Built</h3>
                <p className="text-muted-foreground mb-6">
                  DemandGentic is my commitment to reversing that trend. We have taken 10+ years
                  of frontline demand generation experience and distilled it into:
                </p>
                <ul className="space-y-3">
                  {[
                    "Agents that think before they act",
                    "Systems that respect before they reach out",
                    "AI that provides value before asking for a meeting",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="h-5 w-5 rounded-full bg-violet-100 flex items-center justify-center mt-0.5 shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5 text-violet-600" />
                      </div>
                      <span className="text-slate-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Visual representation */}
          <div className="p-8 rounded-3xl bg-slate-900 text-white">
            <div className="grid md:grid-cols-3 gap-8 items-center">
              <div className="text-center">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-10 w-10 text-slate-400" />
                </div>
                <h4 className="font-bold text-lg mb-2">Traditional AI</h4>
                <p className="text-sm text-slate-400">Automates tasks blindly</p>
              </div>

              <div className="flex items-center justify-center">
                <div className="flex items-center gap-4">
                  <ChevronRight className="h-8 w-8 text-slate-600" />
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                    <Sparkles className="h-8 w-8 text-white" />
                  </div>
                  <ChevronRight className="h-8 w-8 text-slate-600" />
                </div>
              </div>

              <div className="text-center">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/25">
                  <Brain className="h-10 w-10 text-white" />
                </div>
                <h4 className="font-bold text-lg mb-2">DemandGentic AI</h4>
                <p className="text-sm text-violet-300">Reasons before it acts</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-24 px-6 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />

        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-white/20 text-white border-white/30">
              <Target className="h-3.5 w-3.5 mr-2" />
              Our Mission
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Systematized Sincerity
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="p-6 rounded-2xl bg-white/10 border border-white/20 backdrop-blur">
              <Globe className="h-8 w-8 text-white/80 mb-4" />
              <h3 className="text-xl font-bold mb-3">The Ripple Effect</h3>
              <p className="text-white/80">
                At DemandGentic, we believe that the universe is a joined entity. What we do
                in the global B2B market ripples through our communities. We are the
                "Human in the Loop" — using the cold precision of the machine to protect
                and amplify the sincerity of human connection.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/10 border border-white/20 backdrop-blur">
              <Heart className="h-8 w-8 text-white/80 mb-4" />
              <h3 className="text-xl font-bold mb-3">Beyond Demand Generation</h3>
              <p className="text-white/80">
                We don't just generate demand; we map solutions to human challenges.
                We don't just scale outreach; we scale stewardship. Every interaction
                is an opportunity to demonstrate that business can be done with
                integrity at scale.
              </p>
            </div>
          </div>

          {/* The Quote */}
          <div className="relative">
            <div className="absolute inset-0 bg-white/5 rounded-3xl blur-xl" />
            <div className="relative p-8 md:p-12 rounded-3xl bg-white/10 border border-white/20 backdrop-blur text-center">
              <Quote className="h-12 w-12 text-white/40 mx-auto mb-6" />
              <blockquote className="text-2xl md:text-3xl font-medium mb-8 leading-relaxed">
                "The machine is the map; the human spirit is the compass.
                We use both to build a world where technology solves more than it consumes."
              </blockquote>
              <div className="flex items-center justify-center gap-4">
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-xl font-bold text-white">
                  ZM
                </div>
                <div className="text-left">
                  <p className="font-bold">Zahid Mohammadi</p>
                  <p className="text-white/70 text-sm">Founder & Chief AI Architect</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Milestones Timeline */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-slate-100 text-slate-700 border-slate-200">
              <Calendar className="h-3.5 w-3.5 mr-2" />
              The Journey
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              The Founder's{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                Milestones
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              From Kabul to building the world's first account-aware, ethically-aligned demand engine.
            </p>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical Line */}
            <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-1 bg-gradient-to-b from-amber-400 via-violet-500 to-blue-500 rounded-full hidden md:block" />

            <div className="space-y-12">
              {[
                {
                  year: "2017",
                  title: "The Beginning",
                  description: "Founded Pivotal B2B in Afghanistan, serving global tech markets against all odds. Learned that every interaction counts when the stakes are real.",
                  icon: Flag,
                  color: "amber",
                  align: "right",
                },
                {
                  year: "2020-2024",
                  title: "Global Expansion",
                  description: "Managed 100+ global demand generation campaigns, identifying the fatal flaws in traditional 'Volume-First' automation. Saw the need for reasoning.",
                  icon: Globe,
                  color: "violet",
                  align: "left",
                },
                {
                  year: "2025",
                  title: "The Intelligence Layer",
                  description: "Engineered the Reasoning & Problem-Intelligence Layer, moving beyond simple AI toward Agentic Autonomy. Built the foundation for intelligent demand.",
                  icon: Brain,
                  color: "indigo",
                  align: "right",
                },
                {
                  year: "2026",
                  title: "DemandGentic AI",
                  description: "Launched DemandGentic AI — the world's first account-aware, ethically-aligned demand engine. The culmination of a decade of frontline experience.",
                  icon: Rocket,
                  color: "blue",
                  align: "left",
                },
              ].map((milestone, i) => (
                <div key={i} className={`flex items-center gap-8 ${milestone.align === "left" ? "md:flex-row-reverse" : ""}`}>
                  {/* Content */}
                  <div className={`flex-1 ${milestone.align === "left" ? "md:text-right" : ""}`}>
                    <Card className="border-2 hover:shadow-lg transition-shadow bg-white inline-block">
                      <CardContent className="p-6">
                        <Badge className={`mb-3 bg-${milestone.color}-50 text-${milestone.color}-700 border-${milestone.color}-200`}>
                          {milestone.year}
                        </Badge>
                        <h3 className="text-xl font-bold mb-2">{milestone.title}</h3>
                        <p className="text-muted-foreground">{milestone.description}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Icon */}
                  <div className="relative z-10 hidden md:flex">
                    <div className={`h-16 w-16 rounded-2xl bg-gradient-to-br from-${milestone.color}-500 to-${milestone.color}-600 flex items-center justify-center shadow-lg`}>
                      <milestone.icon className="h-8 w-8 text-white" />
                    </div>
                  </div>

                  {/* Spacer */}
                  <div className="flex-1 hidden md:block" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-violet-50 text-violet-700 border-violet-200">
              Our Values
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              What We{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                Stand For
              </span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Shield,
                title: "Integrity First",
                description: "Every action, every algorithm, every interaction is built on a foundation of honesty and transparency.",
              },
              {
                icon: Heart,
                title: "Human-Centric",
                description: "Technology serves humans, not the other way around. We never forget the person at the other end.",
              },
              {
                icon: Compass,
                title: "Purposeful Innovation",
                description: "We don't build technology for technology's sake. Every feature solves a real human challenge.",
              },
              {
                icon: Users,
                title: "Stewardship",
                description: "We are stewards of progress — using our capabilities to build a better future for all.",
              },
            ].map((value, i) => (
              <Card key={i} className="border-2 hover:shadow-lg transition-shadow bg-white text-center">
                <CardContent className="p-8">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mx-auto mb-6">
                    <value.icon className="h-7 w-7 text-violet-600" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{value.title}</h3>
                  <p className="text-muted-foreground">{value.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900/50 via-transparent to-amber-900/30" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-amber-500/10 rounded-full blur-3xl" />

        <div className="max-w-4xl mx-auto text-center relative">
          <Badge className="mb-6 bg-white/10 text-white border-white/20">
            Join the Journey
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to Build Demand with{" "}
            <span className="bg-gradient-to-r from-violet-400 to-amber-400 bg-clip-text text-transparent">
              Integrity?
            </span>
          </h2>
          <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
            Join the global tech leaders who trust DemandGentic.ai to turn data into meaningful relationships.
            Experience demand generation built on purpose, not just performance.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-base h-14 px-8 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 shadow-lg shadow-violet-500/25">
              Schedule Strategy Call
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="text-base h-14 px-8 border-2 border-white/20 text-white hover:bg-white/10">
              <Play className="mr-2 h-5 w-5" />
              See the Platform
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 bg-slate-950 text-white">
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
                Technology as a steward of progress — using data to solve problems, not create noise.
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
                <li><a href="/welcome#platform" className="hover:text-white transition-colors">AI Agents</a></li>
                <li><a href="/welcome#data" className="hover:text-white transition-colors">Data & Intelligence</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Services</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="/welcome#services" className="hover:text-white transition-colors">AI-Led ABM</a></li>
                <li><a href="/welcome#services" className="hover:text-white transition-colors">Content Demand</a></li>
                <li><a href="/welcome#services" className="hover:text-white transition-colors">AI SDR</a></li>
                <li><a href="/welcome#services" className="hover:text-white transition-colors">Appointments</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="/resources-centre" className="hover:text-white transition-colors">Resources Center</a></li>
                <li><span className="text-white">About Us</span></li>
                <li><a href="/welcome" className="hover:text-white transition-colors">Home</a></li>
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
