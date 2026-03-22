import { useLocation } from "wouter";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  Layers,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Phone,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BRAND,
  FOOTER,
  FOUNDER_QUOTES,
  HOMEPAGE_GOVERNANCE,
  STATS,
  TAGLINE,
} from "@shared/brand-messaging";

const iconMap: Record = {
  BrainCircuit,
  ClipboardCheck,
  Layers,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Phone,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wand2,
};

const toneStyles = {
  amber: "border-amber-200/60 bg-amber-50 text-amber-950",
  blue: "border-sky-200/60 bg-sky-50 text-sky-950",
  cyan: "border-cyan-200/60 bg-cyan-50 text-cyan-950",
  emerald: "border-emerald-200/60 bg-emerald-50 text-emerald-950",
  indigo: "border-indigo-200/60 bg-indigo-50 text-indigo-950",
  rose: "border-rose-200/60 bg-rose-50 text-rose-950",
  slate: "border-slate-200/60 bg-slate-100 text-slate-950",
  teal: "border-teal-200/60 bg-teal-50 text-teal-950",
} as const;

function getIcon(iconName: string): LucideIcon {
  return iconMap[iconName] || Sparkles;
}

function SectionBadge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    
      {children}
    
  );
}

function RuntimeVisual() {
  const orbitStates = [
    {
      id: "research",
      eyebrow: "State 01",
      title: "Research",
      detail: "Account context.",
      iconName: "BrainCircuit",
      positionClass: "left-[6px] top-[56px] sm:left-[24px] sm:top-[112px]",
      animation: { x: [0, -4, 0, -2, 0], y: [0, -8, 0, 5, 0] },
    },
    {
      id: "generate",
      eyebrow: "State 02",
      title: "Generate",
      detail: "Assets in flow.",
      iconName: "Wand2",
      positionClass: "right-[6px] top-[56px] sm:right-[24px] sm:top-[120px]",
      animation: { x: [0, 5, 0, 3, 0], y: [0, 6, 0, -7, 0] },
    },
    {
      id: "preview",
      eyebrow: "State 03",
      title: "Preview",
      detail: "Safe simulation.",
      iconName: "Play",
      positionClass: "right-[6px] bottom-[18px] sm:right-[22px] sm:bottom-[54px]",
      animation: { x: [0, 5, 0, 3, 0], y: [0, 7, 0, -5, 0] },
    },
    {
      id: "govern",
      eyebrow: "State 04",
      title: "Govern",
      detail: "QA attached.",
      iconName: "ClipboardCheck",
      positionClass: "left-[6px] bottom-[18px] sm:left-[22px] sm:bottom-[62px]",
      animation: { x: [0, -5, 0, -3, 0], y: [0, -6, 0, 8, 0] },
    },
  ];

  return (
    
      
      
        
          {HOMEPAGE_GOVERNANCE.releaseLabel} - v{HOMEPAGE_GOVERNANCE.version}
        
        Shared context before execution
      

      
      
      

      
        
          
        
        Shared reasoning
        Launch state
        
          Context, policy, and preview stay attached.
        
        
          Previewed + governed
        
      

      {orbitStates.map((state) => {
        const Icon = getIcon(state.iconName);

        return (
          
            
              
                
              
              {state.eyebrow}
              {state.title}
              {state.detail}
            
          
        );
      })}

      
        
          Managed through content governance
          Four states stay in sync around one launch decision instead of colliding into a dashboard pile.
        
      
    
  );
}

export default function LandingPage() {
  const [, setLocation] = useLocation();

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    
      
        
          
            
              {BRAND.company.logoInitials}
            
            
              {BRAND.company.parentBrand}
              {BRAND.company.productName}
            
          

          
            {HOMEPAGE_GOVERNANCE.navigation.map((item) => (
               scrollToSection(item.href.replace("#", ""))}
                className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
              >
                {item.label}
              
            ))}
            
              Resources
            
          

          
             setLocation("/client-portal/login")} className="hidden text-slate-200 hover:bg-white/10 hover:text-white sm:inline-flex">
              Client Login
            
             setLocation("/book/admin/demo")} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              {HOMEPAGE_GOVERNANCE.hero.primaryCta}
              
            
          
        
      

      
        
          
          
            
              
                {HOMEPAGE_GOVERNANCE.hero.badge} - v{HOMEPAGE_GOVERNANCE.version}
              
              {HOMEPAGE_GOVERNANCE.hero.eyebrow}
              
                {HOMEPAGE_GOVERNANCE.hero.headline}
              
              
                {HOMEPAGE_GOVERNANCE.hero.subHeadline}
              
              {HOMEPAGE_GOVERNANCE.hero.summary}
              
                {HOMEPAGE_GOVERNANCE.hero.bullets.map((bullet) => (
                  
                    
                    {bullet}
                  
                ))}
              
              
                 setLocation("/book/admin/demo")} className="h-14 bg-cyan-400 px-8 text-base text-slate-950 hover:bg-cyan-300">
                  {HOMEPAGE_GOVERNANCE.hero.primaryCta}
                  
                
                 scrollToSection("platform")} className="h-14 border-white/15 bg-white/5 px-8 text-base text-white hover:bg-white/10">
                  
                  {HOMEPAGE_GOVERNANCE.hero.secondaryCta}
                
              
              
                
                  {TAGLINE.primary}
                
                
                  {HOMEPAGE_GOVERNANCE.hero.supportingLabel}
                
              
            

            
              
            
          

          
            
              {HOMEPAGE_GOVERNANCE.proofBar.map((item) => (
                
                  {item.value}
                  {item.label}
                
              ))}
            
          
        

        
          
            Platform Story
            
              The old stack creates activity. It does not create shared judgment.
            
            
              The newest version of the platform is built to replace fragmented execution, generic outreach,
              and unguided AI with one reasoning-first, auditable operating model.
            

            
              {HOMEPAGE_GOVERNANCE.stackFrictions.map((item) => {
                const Icon = getIcon(item.iconName);

                return (
                  
                    
                      
                        
                          
                        
                        
                          {item.stat}
                        
                      
                      {item.title}
                      {item.description}
                    
                  
                );
              })}
            
          
        

        
          
            
              
                Orchestration Flow
                
                  The platform behaves like an operating system, not a tool bundle.
                
                
                  Intelligence comes first, creation follows context, simulation happens before launch, and governance stays visible the entire way through.
                

                
                  {HOMEPAGE_GOVERNANCE.orchestrationFlow.map((item) => (
                    
                      
                        
                          {item.step}
                        
                        
                          {item.title}
                          {item.description}
                        
                      
                    
                  ))}
                
              

              
                {HOMEPAGE_GOVERNANCE.platformModules.map((module) => {
                  const Icon = getIcon(module.iconName);
                  const tone = toneStyles[module.tone as keyof typeof toneStyles];

                  return (
                    
                      
                        
                          
                            
                          
                          
                            {module.category}
                          
                        
                        {module.name}
                        {module.description}
                        
                          {module.highlights.map((highlight) => (
                            
                              
                              {highlight}
                            
                          ))}
                        
                      
                    
                  );
                })}
              
            
          
        

        
          
          
            
              
                
                  {HOMEPAGE_GOVERNANCE.governanceStory.badge}
                
                
                  {HOMEPAGE_GOVERNANCE.governanceStory.title}
                
                {HOMEPAGE_GOVERNANCE.governanceStory.description}
                
                  Governance controls
                  
                    {HOMEPAGE_GOVERNANCE.managedThrough.map((item) => (
                      
                        {item}
                      
                    ))}
                  
                
              

              
                {HOMEPAGE_GOVERNANCE.governanceStory.pillars.map((item) => {
                  const Icon = getIcon(item.iconName);

                  return (
                    
                      
                        
                          
                        
                        {item.title}
                        {item.description}
                      
                    
                  );
                })}
              
            
          
        

        
          
            
              Our Story
              
                {HOMEPAGE_GOVERNANCE.story.title}
              
              {HOMEPAGE_GOVERNANCE.story.body}

              
                
                  
                    
                      {BRAND.founder.initials}
                    
                    
                      {BRAND.founder.name}
                      {BRAND.founder.title}
                      
                        Founded in {BRAND.company.foundedLocation}, {BRAND.company.foundedYear}
                      
                    
                  
                  
                    {FOUNDER_QUOTES.landing}
                  
                  
                    {[
                      { label: "Years", value: STATS.yearsExperience },
                      { label: "Enterprise clients", value: STATS.enterpriseClients },
                      { label: "Global campaigns", value: STATS.globalCampaigns },
                    ].map((item) => (
                      
                        {item.value}
                        {item.label}
                      
                    ))}
                  
                
              
            

            
              
                
                  
                    
                      
                    
                    
                      Built for operators
                      The teams replacing noise with governed execution.
                    
                  
                  
                    {HOMEPAGE_GOVERNANCE.audiences.map((audience) => (
                      
                        
                        {audience}
                      
                    ))}
                  
                
              

              
                
                  
                    
                      
                    
                    
                      
                        Reasoning-first, nothing-forgotten execution
                      
                      {TAGLINE.corePromise}
                    
                  
                
              
            
          
        

        
          
          
            Final CTA
            
              {HOMEPAGE_GOVERNANCE.cta.title}
            
            {HOMEPAGE_GOVERNANCE.cta.description}
            
               setLocation("/book/admin/demo")} className="h-14 bg-cyan-400 px-8 text-base text-slate-950 hover:bg-cyan-300">
                {HOMEPAGE_GOVERNANCE.cta.primary}
                
              
               setLocation("/proposal-request")} className="h-14 border-white/15 bg-white/5 px-8 text-base text-white hover:bg-white/10">
                {HOMEPAGE_GOVERNANCE.cta.secondary}
              
            
          
        
      

      
        
          
            
              
                
                  {BRAND.company.logoInitials}
                
                
                  {BRAND.company.parentBrand}
                  {BRAND.company.productName}
                
              
              {TAGLINE.footerTagline}
              
                {BRAND.company.legalName}
                {BRAND.company.location}
                {BRAND.company.phone}
                {BRAND.domains.primary}
              
            

            
              Platform
              
                {FOOTER.navSections.platform.map((item) => {item})}
              
            

            
              Services
              
                {FOOTER.navSections.services.map((item) => {item})}
              
            

            
              Resources
              
                Resources Center
                 scrollToSection("about")} className="transition-colors hover:text-white">About Us
                 scrollToSection("story")} className="transition-colors hover:text-white">Platform Story
              
            

            
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