
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
  Brain
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ClientServices() {
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
    {
      icon: Database,
      badge: "Data",
      title: "B2B Data & Enrichment",
      description: "Access our 70M+ verified contact database or enrich your existing data with our verification engine.",
      features: ["Custom list building", "Database enrichment", "Continuous hygiene"],
      ideal: "Campaign fuel",
      color: "slate",
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Our Services</h1>
        <p className="text-muted-foreground">
          Explore the full range of DemandGentic.ai services available to supercharge your pipeline.
        </p>
      </div>

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
