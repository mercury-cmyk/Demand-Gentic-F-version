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
import { BRAND, TAGLINE, STATS, FOOTER, PUBLIC_PAGES_MESSAGING } from "@shared/brand-messaging";

export default function AboutPage() {
  const [, setLocation] = useLocation();

  return (
    
      {/* Navigation */}
      
        
           setLocation("/welcome")}>
            
              
                {BRAND.company.logoInitials}
                
              
            
            
              {BRAND.company.parentBrand}
              {TAGLINE.full}
            
          
          
            How It Works
            Capabilities
            Services
            Resources
            About
          
          
             setLocation("/client-portal/login")}>
              Client Login
            
             setLocation("/book/admin/demo")} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
              Book a Demo
              
            
          
        
      

      {/* Hero Section */}
      
        {/* Background Elements */}
        
        
        

        {/* Subtle Pattern */}
        

        
          
            
            The Architect's Journey
          

          
            From Kabul to the{" "}
            
              Cutting Edge of Agentic AI
            
          

          
            A journey from one of the world's most complex environments to building
            technology that restores reasoning, trust, and human connection in B2B.
          

          
            
              
              Founded in Afghanistan, 2017
            
            
              
              Serving Global Markets
            
            
              
              Agentic AI Pioneer
            
          
        
      

      {/* The Origin Story */}
      
        
          
            {/* Left: Visual Element */}
            
              
              
                {/* Main Card */}
                
                  
                    {/* Top decorative bar */}
                    

                    
                      
                        
                          ZM
                        
                        
                          Zahid Mohammadi
                          CEO & The Architect
                        
                      

                      
                        
                          
                            
                          
                          
                            Origin
                            Kabul, Afghanistan
                          
                        
                        
                          
                            
                          
                          
                            Mission
                            Steward of Progress
                          
                        
                        
                          
                            
                          
                          
                            Role
                            The Architect
                          
                        
                      

                      
                        
                          
                            {STATS.yearsExperience}
                            Years B2B
                          
                          
                            {STATS.globalCampaigns}
                            Global Campaigns
                          
                          
                            {STATS.leadsGenerated}
                            Leads Generated
                          
                        
                      
                    
                  
                

                {/* Floating accent */}
                
                  
                
              
            

            {/* Right: Story Content */}
            
              The Beginning
              
                A Truth Forged in{" "}
                
                  High-Stakes Environments
                
              

              
                
                  In 2017, I founded Pivotal B2B in Kabul, Afghanistan. Operating in one of the world's
                  most complex and high-stakes environments taught me a singular, unshakeable truth:
                

                
                  
                    "Technology is only as valuable as the integrity behind it."
                  
                

                
                  In the physical world, I watched as resources were seized and communities were
                  marginalized because systems lacked a human-centric "Why." When I transitioned
                  into the role of The Architect, I saw the same patterns emerging in the
                  digital landscape:
                

                
                  
                    Unintelligent algorithms
                  
                  
                    Creating noise
                  
                  
                    Eroding trust
                  
                

                
                  The same patterns that marginalized communities in the physical world were now
                  marginalizing businesses in the digital one. I knew there had to be a better way.
                
              
            
          
        
      

      {/* Restoring the Human in the Loop */}
      
        
          
            
              
              The Philosophy
            
            
              Restoring the{" "}
              
                "Human in the Loop"
              
            
            
              I didn't build DemandGentic AI to simply "automate" sales. I built it to restore Reasoning.
            
          

          
            {/* The Problem We Saw */}
            
              
                
                  
                
                The Problem We Saw
                
                  As humans, we are born with an innate capacity to solve problems — a state of
                  original innocence and curiosity. Today's algorithmic world often suppresses
                  that curiosity with:
                
                
                  {[
                    "Outrage Algorithms that optimize for clicks, not connection",
                    "Blind automation that scales noise instead of value",
                    "Systems that forget the human at the other end",
                  ].map((item, i) => (
                    
                      
                        ✕
                      
                      {item}
                    
                  ))}
                
              
            

            {/* The Solution We Built */}
            
              
                
                  
                
                The Solution We Built
                
                  DemandGentic is my commitment to reversing that trend. We have taken {STATS.yearsExperience} years
                  of frontline demand generation experience and distilled it into:
                
                
                  {[
                    "Agents that think before they act",
                    "Systems that respect before they reach out",
                    "AI that provides value before asking for a meeting",
                  ].map((item, i) => (
                    
                      
                        
                      
                      {item}
                    
                  ))}
                
              
            
          

          {/* Visual representation */}
          
            
              
                
                  
                
                Traditional AI
                Automates tasks blindly
              

              
                
                  
                  
                    
                  
                  
                
              

              
                
                  
                
                DemandGentic AI
                Reasons before it acts
              
            
          
        
      

      {/* Mission Section */}
      
        

        
          
            
              
              Our Mission
            
            
              Systematized Sincerity
            
          

          
            
              
              The Ripple Effect
              
                At DemandGentic, we believe that the universe is a joined entity. What we do
                in the global B2B market ripples through our communities. We are the
                "Human in the Loop" — using the cold precision of the machine to protect
                and amplify the sincerity of human connection.
              
            

            
              
              Beyond Demand Generation
              
                We don't just generate demand; we map solutions to human challenges.
                We don't just scale outreach; we scale stewardship. Every interaction
                is an opportunity to demonstrate that business can be done with
                integrity at scale.
              
            
          

          {/* The Quote */}
          
            
            
              
              
                "The machine is the map; the human spirit is the compass.
                We use both to build a world where technology solves more than it consumes."
              
              
                
                  ZM
                
                
                  Zahid Mohammadi
                  CEO & The Architect
                
              
            
          
        
      

      {/* Milestones Timeline */}
      
        
          
            
              
              The Journey
            
            
              The Founder's{" "}
              
                Milestones
              
            
            
              From Kabul to building the world's first account-aware, ethically-aligned demand engine.
            
          

          {/* Timeline */}
          
            {/* Vertical Line */}
            

            
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
                
                  {/* Content */}
                  
                    
                      
                        
                          {milestone.year}
                        
                        {milestone.title}
                        {milestone.description}
                      
                    
                  

                  {/* Icon */}
                  
                    
                      
                    
                  

                  {/* Spacer */}
                  
                
              ))}
            
          
        
      

      {/* Values Section */}
      
        
          
            
              Our Values
            
            
              What We{" "}
              
                Stand For
              
            
          

          
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
              
                
                  
                    
                  
                  {value.title}
                  {value.description}
                
              
            ))}
          
        
      

      {/* CTA Section */}
      
        
        
        

        
          
            Join the Journey
          
          
            Ready to Build Demand with{" "}
            
              Integrity?
            
          
          
            {PUBLIC_PAGES_MESSAGING.closingStatement.contrast}{" "}
            {PUBLIC_PAGES_MESSAGING.closingStatement.assertion}
          
          
            Join the B2B leaders who trust DemandGentic.ai to turn intelligence into revenue
            with reasoning-first agents, compliance-first execution, and brand-controlled demand.
          

          
             setLocation("/book/admin/demo")} className="text-base h-14 px-8 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 shadow-lg shadow-violet-500/25">
              Book a Demo
              
            
             setLocation("/proposal-request")} className="text-base h-14 px-8 border-2 border-white/20 text-white hover:bg-white/10">
              Request a Proposal
              
            
          
        
      

      {/* Footer */}
      
        
          
            
              
                
                  
                    PB
                    
                  
                
                
                  {BRAND.company.parentBrand}
                  {TAGLINE.full}
                
              
              
                Technology as a steward of progress — using data to solve problems, not create noise.
              
              
                {BRAND.company.legalName}
                {BRAND.company.location}
                {BRAND.company.phone}
                {BRAND.domains.primary}
              
            

            
              Platform
              
                AI Agents
                Voice AI
                Content Studio
                Pipeline Intelligence
                Data & Intelligence
              
            

            
              Services
              
                AI-Led ABM
                Conversational Voice AI
                Generative Content
                AI SDR
                Appointments
                Data Services
              
            

            
              Resources
              
                Resources Center
                About Us
                Home
              
            

            
              Get Started
              
                Schedule a Meeting
                Request a Proposal
                Contact Us
              
            
          

          
            
              {FOOTER.copyright}
            
            
              Privacy Policy
              Terms of Service
              GDPR
            
          
        
      
    
  );
}