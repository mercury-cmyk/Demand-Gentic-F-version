
import {
  Target,
  Users,
  Phone,
  Mail,
  Zap,
  Search,
  Lightbulb,
  Sparkles,
  Database,
  Shield,
  TrendingUp,
  LayoutDashboard,
  Calendar,
  CheckCircle2,
  Bot,
  Wand2,
  Layers,
  Brain,
  Rocket,
  BarChart,
  Settings,
  HelpCircle,
  Presentation,
  Briefcase
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getClientPortalUser } from "@/lib/client-portal-session";

export default function ClientServices() {
  const user = getClientPortalUser();
  const clientName = user?.firstName || user?.clientAccountName || 'Partner';
  const isArgyle = user?.clientAccountName === 'Argyle' || clientName === 'Argyle';

  const steps = [
    {
      icon: Settings,
      title: "1. Configure Your Intelligence",
      description: "Start by setting up your Organization Intelligence. Define your Brand Voice, Ideal Customer Profile (ICP), and Value Proposition. This ensures all AI agents speak your language.",
      action: "Go to Intelligence",
      link: "/client-portal/intelligence"
    },
    {
      icon: Rocket,
      title: "2. Launch a Campaign",
      description: "Create a new campaign targeting your specific audience. Choose from Voice, Email, or LinkedIn channels, or orchestrate them all together.",
      action: "View Campaigns",
      link: "/client-portal/dashboard?tab=campaigns"
    },
    {
      icon: Users,
      title: "3. Manage Leads & Opportunities",
      description: "As leads come in, they are qualified by our AI. View them in your dashboard, listen to call recordings, and track their journey through the pipeline.",
      action: "View Leads",
      link: "/client-portal/dashboard?tab=leads"
    },
    {
      icon: BarChart,
      title: "4. Optimize Performance",
      description: "Review comprehensive analytics on call quality, email open rates, and conversion metrics. Use these insights to refine your strategy.",
      action: "View Analytics",
      link: "/client-portal/analytics"
    }
  ];

  const services = [
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
      icon: Phone,
      badge: "Voice AI",
      title: "Conversational AI Voice Agents",
      description: "AI agents that make and receive real phone calls with natural conversation, live objection handling, and seamless meeting booking.",
      features: ["Live phone conversations", "Real-time qualification", "Gatekeeper navigation"],
      ideal: "Outbound at scale without headcount",
      color: "amber",
    },
    {
      icon: Mail,
      badge: "Email Marketing",
      title: "Intelligent Email Marketing",
      description: "AI-crafted email campaigns with persona-specific sequences, smart send-time optimization, and reply sentiment analysis — every email reasoned before it's sent.",
      features: ["Persona-specific sequences", "Send-time optimization", "Reply sentiment analysis"],
      ideal: "Nurture & conversion at scale",
      color: "sky",
    },
    {
      icon: Wand2,
      badge: "Content Studio",
      title: "Generative Content Creation",
      description: "A full AI-powered content studio that generates landing pages, email campaigns, blog posts, eBooks, solution briefs, and images — all in your brand voice.",
      features: ["7 content generation engines", "One-click publishing", "AI-powered refinement"],
      ideal: "Campaign content at speed",
      color: "emerald",
    },
    {
      icon: Bot,
      badge: "AI SDR",
      title: "AI SDR-as-a-Service",
      description: "Autonomous AI agents conduct first-touch outreach, qualification, follow-ups, and meeting booking across voice and email.",
      features: ["24/7 autonomous engagement", "Human strategist oversight", "Intelligent escalation"],
      ideal: "Scale without headcount",
      color: "blue",
    },
    {
      icon: LayoutDashboard,
      badge: "Pipeline",
      title: "Intelligent Pipeline Management",
      description: "Manage your entire top-of-funnel with AI-driven account staging, automated AE assignment, and buyer journey tracking.",
      features: ["AI-powered AE assignment", "Buyer journey stages", "Account intelligence scoring"],
      ideal: "Pipeline visibility & control",
      color: "indigo",
    },
    {
      icon: Calendar,
      badge: "Appointments",
      title: "Qualified Appointment Generation",
      description: "We deliver BANT-qualified sales appointments directly to your team's calendar through multi-channel outreach.",
      features: ["Full top-of-funnel management", "Multi-channel outreach", "No-show follow-up"],
      ideal: "Sales efficiency",
      color: "rose",
    },
    {
      icon: Search,
      badge: "Intelligence",
      title: "Market & Account Intelligence",
      description: "Deep research, enrichment, and analysis of accounts and industries to power better GTM decisions.",
      features: ["ICP refinement", "Competitive landscape", "Buying signal detection"],
      ideal: "GTM strategy",
      color: "cyan",
    },
  ];

  const agents = [
    {
      icon: Search,
      title: "Research Agent",
      subtitle: "Demand Intel",
      description: "Autonomous fact-gathering and strategic synthesis. Researches accounts, verifies data, and generates actionable intelligence briefs.",
      capabilities: ["Multi-source verification", "Problem-to-account matching", "Confidence scoring"],
      color: "emerald",
    },
    {
      icon: Phone,
      title: "Voice Agent",
      subtitle: "Live Conversations",
      description: "AI that makes real phone calls with natural speech, live objection handling, and the ability to book meetings mid-conversation.",
      capabilities: ["Natural live conversations", "Gatekeeper navigation", "Real-time BANT qualification"],
      color: "amber",
    },
    {
      icon: Mail,
      title: "Email Agent",
      subtitle: "Demand Engage",
      description: "AI trained on millions of B2B campaigns. Crafts persona-specific sequences that know when to push and when to nurture.",
      capabilities: ["Persona-specific copy", "Sequence optimization", "Reply sentiment analysis"],
      color: "blue",
    },
    {
      icon: Wand2,
      title: "Content Agent",
      subtitle: "Creative Studio",
      description: "Creates complete campaign assets — landing pages, email templates, blog posts, eBooks, solution briefs, and images — all in your brand voice.",
      capabilities: ["7 content engines", "One-click publish", "AI-powered refinement"],
      color: "violet",
    },
    {
      icon: LayoutDashboard,
      title: "Pipeline Agent",
      subtitle: "Account Intelligence",
      description: "Manages your top-of-funnel pipeline. Scores accounts, tracks buyer journeys through stages, and intelligently assigns reps to opportunities.",
      capabilities: ["AI-driven AE assignment", "Buyer journey tracking", "Account stage automation"],
      color: "indigo",
    },
    {
      icon: Shield,
      title: "QA Agent",
      subtitle: "Compliance & Quality",
      description: "Real-time auditing across every interaction for quality, accuracy, and compliance. Ensures every touchpoint meets your standards.",
      capabilities: ["Real-time monitoring", "Policy enforcement", "Audit trail generation"],
      color: "rose",
    },
  ];

  return (
    <div className="space-y-8 p-6 max-w-[1600px] mx-auto min-h-screen">
      
      {/* Personalized Welcome Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-8 text-white border border-slate-700 shadow-xl">
        <div className="max-w-3xl">
          <Badge className="mb-4 bg-indigo-500/20 text-indigo-200 border-indigo-500/30 hover:bg-indigo-500/30">Client Guide</Badge>
          <h1 className="text-4xl font-bold tracking-tight mb-4">Welcome, {clientName}</h1>
          <p className="text-lg text-slate-300 leading-relaxed">
            This guide is designed to help you get the most out of DemandGentic.ai. 
            Follow the steps below to orchestrate your campaigns, manage your intelligence, and drive pipeline growth.
          </p>
        </div>
      </div>

      {/* Argyle Custom Integrated Strategy Module */}
      {isArgyle && (
        <Card className="bg-gradient-to-br from-indigo-50 via-white to-blue-50 border-indigo-200 shadow-md relative overflow-hidden">
          {/* Decorative background blob */}
          <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 border-indigo-200">
                <Sparkles className="h-3 w-3 mr-1 fill-indigo-400" />
                Strategic Partnership
              </Badge>
            </div>
            <CardTitle className="text-3xl font-bold text-slate-900">
              Integrated Growth Engine
            </CardTitle>
            <CardDescription className="text-lg text-slate-600 max-w-2xl">
              Unifying your inside sales capabilities with intelligent event recruitment to create a closed-loop revenue ecosystem.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="grid md:grid-cols-3 gap-8 relative z-10 pt-4">
            {/* Column 1: Inside Sales */}
            <div className="flex flex-col gap-4 p-4 rounded-xl bg-white/60 border border-white/50 shadow-sm transition-all hover:bg-white hover:shadow-md">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <Briefcase className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Inside Sales Integration</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  We empower your inside sales team to sell <span className="font-semibold text-blue-700">digital forums and programs</span> to enterprises more effectively. Our agents identify high-intent prospects and deliver qualified opportunities directly to your pipeline.
                </p>
              </div>
            </div>

            {/* Column 2: Event Recruitment */}
            <div className="flex flex-col gap-4 p-4 rounded-xl bg-white/60 border border-white/50 shadow-sm transition-all hover:bg-white hover:shadow-md">
              <div className="h-12 w-12 rounded-lg bg-pink-100 flex items-center justify-center shrink-0">
                <Users className="h-6 w-6 text-pink-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Event Audience Recruitment</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Our programs seamlessly align with your <span className="font-semibold text-pink-700">campaign execution</span> to recruit the exact right audience for your events. We handle the outreach, ensuring your events are filled with relevant decision-makers.
                </p>
              </div>
            </div>

            {/* Column 3: The Synergy */}
            <div className="flex flex-col gap-4 p-4 rounded-xl bg-indigo-600 text-white shadow-xl transform scale-105 border-indigo-500">
              <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                <Layers className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">The Integrated Synergy</h3>
                <p className="text-sm text-indigo-100 leading-relaxed">
                  Combining sales acceleration with audience acquisition creates a virtuous cycle. Enterprises buying programs become event speakers; event attendees become buyers.
                </p>
                <div className="mt-4 pt-4 border-t border-white/20">
                  <p className="font-medium text-white flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    We make both ways work for you.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* How It Works - Steps */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {steps.map((step, i) => (
          <Card key={i} className="border-slate-200 shadow-sm hover:shadow-md transition-all">
            <CardContent className="p-6 flex flex-col h-full">
              <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                <step.icon className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-bold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground mb-4 flex-grow">{step.description}</p>
              <Button asChild variant="outline" className="w-full mt-auto">
                <a href={step.link}>{step.action}</a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="py-8">
        <h2 className="text-2xl font-bold tracking-tight mb-6 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-indigo-600" />
          Service Catalog
        </h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, i) => (
            <Card key={i} className="border hover:shadow-md transition-all">
              <CardContent className="p-6">
                <div className={`h-12 w-12 rounded-xl bg-${service.color}-500/10 flex items-center justify-center mb-4`}>
                  <service.icon className={`h-6 w-6 text-${service.color}-600`} />
                </div>
                <Badge className={`mb-4 bg-${service.color}-50 text-${service.color}-700 border-${service.color}-100`}>
                  {service.badge}
                </Badge>
                <h3 className="text-lg font-bold mb-2">{service.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{service.description}</p>
                <ul className="space-y-2 mb-6">
                  {service.features.map((feature, j) => (
                    <li key={j} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className={`h-3 w-3 text-${service.color}-500`} />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="pt-8 border-t">
        <h2 className="text-2xl font-bold tracking-tight mb-6">AgentX Suite</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent, i) => (
            <Card key={i} className="border hover:shadow-md transition-all">
              <CardContent className="p-6">
                <div className={`h-12 w-12 rounded-xl bg-${agent.color}-500/10 flex items-center justify-center mb-4`}>
                  <agent.icon className={`h-6 w-6 text-${agent.color}-600`} />
                </div>
                <div className="mb-4">
                  <h3 className="font-bold text-lg">{agent.title}</h3>
                  <p className={`text-xs font-semibold text-${agent.color}-600 uppercase tracking-wider`}>{agent.subtitle}</p>
                </div>
                <p className="text-sm text-muted-foreground mb-4">{agent.description}</p>
                <ul className="space-y-1">
                  {agent.capabilities.map((cap, j) => (
                    <li key={j} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className={`h-3 w-3 text-${agent.color}-500`} />
                      {cap}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      
       {/* Agent Intelligence Summary */}
        <Card className="bg-slate-950 text-white border-slate-800">
            <CardContent className="p-8">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Layers className="h-5 w-5 text-violet-400" />
                    <span className="text-sm font-bold uppercase tracking-wider text-violet-400">The Agentic Steward — AgentX</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Reasoning First. Compliance First. Nothing Forgotten.</h3>
                  <p className="text-slate-400 mb-6">
                    Every AgentX agent is powered by Organization Intelligence — your DNA, your rules, your truth.
                    No interaction happens without reasoning first. No interaction is ever forgotten at the contact
                    or account level. Compliance isn't a checkbox — it's woven into every layer.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {["Organization Intelligence", "Problem Framework", "Compliance First", "Reasoning First", "Brand Voice"].map((item, i) => (
                      <Badge key={i} className="bg-white/10 border-white/20 text-white">{item}</Badge>
                    ))}
                  </div>
                  <div className="mt-6">
                     <Button variant="secondary" className="gap-2">
                        <HelpCircle className="h-4 w-4" />
                        Get Support
                     </Button>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3 mb-2">
                      <Bot className="h-5 w-5 text-slate-400" />
                      <span className="font-semibold">Foundation — Reasoning Layer</span>
                    </div>
                    <p className="text-sm text-slate-400">Problem intelligence, solution mapping, pinpoint context — every action is reasoned before execution</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
    </div>
  );
}
