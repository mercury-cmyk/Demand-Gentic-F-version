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
      title: "3. Track Leads in the Pipeline",
      description: "Review account activity in one place, track engagement across campaigns, and move accounts through the full-funnel pipeline.",
      action: "Open Pipelines",
      link: "/client-portal/dashboard?tab=unified-pipelines"
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
    
      
      {/* Personalized Welcome Header */}
      
        
          Client Guide
          Welcome, {clientName}
          
            This guide is designed to help you get the most out of Pivotal B2B. 
            Follow the steps below to orchestrate your campaigns, manage your intelligence, and drive pipeline growth.
          
        
      

      {/* Argyle Custom Integrated Strategy Module */}
      {isArgyle && (
        
          {/* Decorative background blob */}
          
          
          
            
              
                
                Strategic Partnership
              
            
            
              Integrated Growth Engine
            
            
              Unifying your inside sales capabilities with intelligent event recruitment to create a closed-loop revenue ecosystem.
            
          
          
          
            {/* Column 1: Inside Sales */}
            
              
                
              
              
                Inside Sales Integration
                
                  We empower your inside sales team to sell digital forums and programs to enterprises more effectively. Our agents identify high-intent prospects and deliver qualified opportunities directly to your pipeline.
                
              
            

            {/* Column 2: Event Recruitment */}
            
              
                
              
              
                Event Audience Recruitment
                
                  Our programs seamlessly align with your campaign execution to recruit the exact right audience for your events. We handle the outreach, ensuring your events are filled with relevant decision-makers.
                
              
            

            {/* Column 3: The Synergy */}
            
              
                
              
              
                The Integrated Synergy
                
                  Combining sales acceleration with audience acquisition creates a virtuous cycle. Enterprises buying programs become event speakers; event attendees become buyers.
                
                
                  
                    
                    We make both ways work for you.
                  
                
              
            
          
        
      )}

      {/* How It Works - Steps */}
      
        
          
            Get Started in 4 Steps
          
          How It Works
          
            Go from setup to results in minutes. Follow these steps to launch your first AI-powered campaign.
          
        

        
          {/* Connector line (visible on large screens) */}
          

          {steps.map((step, i) => (
            
              
                
                  
                  
                    {i + 1}
                  
                
                {step.title}
                {step.description}
                
                  {step.action} &rarr;
                
              
            
          ))}
        
      

      
        
          
          Service Catalog
        
        
        
          {services.map((service, i) => (
            
              
                
                  
                
                
                  {service.badge}
                
                {service.title}
                {service.description}
                
                  {service.features.map((feature, j) => (
                    
                      
                      {feature}
                    
                  ))}
                
              
            
          ))}
        
      

      
        AI Agents
        
          {agents.map((agent, i) => (
            
              
                
                  
                
                
                  {agent.title}
                  {agent.subtitle}
                
                {agent.description}
                
                  {agent.capabilities.map((cap, j) => (
                    
                      
                      {cap}
                    
                  ))}
                
              
            
          ))}
        
      
      
       {/* Agent Intelligence Summary */}
        
            
              
                
                  
                    
                    Agentic Intelligence
                  
                  Reasoning First. Compliance First. Nothing Forgotten.
                  
                    Every agent is powered by Organization Intelligence — your DNA, your rules, your truth.
                    No interaction happens without reasoning first. No interaction is ever forgotten at the contact
                    or account level. Compliance isn't a checkbox — it's woven into every layer.
                  
                  
                    {["Organization Intelligence", "Problem Framework", "Compliance First", "Reasoning First", "Brand Voice"].map((item, i) => (
                      {item}
                    ))}
                  
                  
                     
                        
                        Get Support
                     
                  
                
                
                  
                    
                      
                      Foundation — Reasoning Layer
                    
                    Problem intelligence, solution mapping, pinpoint context — every action is reasoned before execution
                  
                
              
            
          
    
  );
}