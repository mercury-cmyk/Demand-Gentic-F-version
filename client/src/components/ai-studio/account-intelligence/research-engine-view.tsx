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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Research Engine (Truth Gathering)</h3>
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          Last Updated: Just now
        </Badge>
      </div>
      
      <Accordion type="single" collapsible className="w-full" defaultValue="overview">
        {categories.map((category) => (
          <AccordionItem key={category.id} value={category.id}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <category.icon className="h-4 w-4 text-muted-foreground" />
                <span>{category.title}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-3 pl-6">
                {category.facts.map((fact, i) => (
                  <div key={i} className="flex items-start justify-between group">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">{fact.label}</p>
                      <p className="text-sm">{fact.value}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {fact.source && (
                        <a href="#" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {fact.source} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <Badge 
                        variant="secondary" 
                        className={
                          fact.confidence === "verified" ? "bg-green-100 text-green-800 hover:bg-green-100" :
                          fact.confidence === "inferred" ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" :
                          "bg-gray-100 text-gray-800 hover:bg-gray-100"
                        }
                      >
                        {fact.confidence}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
