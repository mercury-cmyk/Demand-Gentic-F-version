import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExternalLink, Globe, FileText, DollarSign, Users } from "lucide-react";

interface Fact {
  label: string;
  value: string;
  source?: string;
  confidence: "verified" | "inferred" | "unknown";
}

interface FactCategory {
  id: string;
  title: string;
  icon: any;
  facts: Fact[];
}

export function ResearchEngineView() {
  const categories: FactCategory[] = [
    {
      id: "overview",
      title: "Company Overview",
      icon: Globe,
      facts: [
        { label: "Industry", value: "Enterprise Software / DevOps", confidence: "verified", source: "LinkedIn" },
        { label: "Headquarters", value: "San Francisco, CA", confidence: "verified", source: "Website" },
        { label: "Employees", value: "500-1000", confidence: "verified", source: "LinkedIn" },
      ]
    },
    {
      id: "product",
      title: "Products & Features",
      icon: FileText,
      facts: [
        { label: "Core Product", value: "Cloud Infrastructure Automation", confidence: "verified", source: "Product Page" },
        { label: "Key Feature", value: "Self-hosted runners", confidence: "verified", source: "Docs" },
        { label: "Recent Launch", value: "AI-powered security scanning", confidence: "verified", source: "Press Release" },
      ]
    },
    {
      id: "pricing",
      title: "Pricing & Packaging",
      icon: DollarSign,
      facts: [
        { label: "Model", value: "Usage-based + Seat licensing", confidence: "verified", source: "Pricing Page" },
        { label: "Enterprise Tier", value: "Custom pricing, includes SSO", confidence: "verified", source: "Pricing Page" },
        { label: "Estimated ACV", value: "$50k - $100k", confidence: "inferred" },
      ]
    },
    {
      id: "customers",
      title: "Customers & Case Studies",
      icon: Users,
      facts: [
        { label: "Key Customer", value: "Netflix", confidence: "verified", source: "Case Study" },
        { label: "Key Customer", value: "Uber", confidence: "verified", source: "Logo Wall" },
        { label: "Vertical Focus", value: "Tech-forward enterprises", confidence: "inferred" },
      ]
    }
  ];

  return (
    
      
        Research Engine (Truth Gathering)
        
          Last Updated: Just now
        
      
      
      
        {categories.map((category) => (
          
            
              
                
                {category.title}
              
            
            
              
                {category.facts.map((fact, i) => (
                  
                    
                      {fact.label}
                      {fact.value}
                    
                    
                      {fact.source && (
                        
                          {fact.source} 
                        
                      )}
                      
                        {fact.confidence}
                      
                    
                  
                ))}
              
            
          
        ))}
      
    
  );
}