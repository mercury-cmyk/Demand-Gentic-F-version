import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, CalendarDays, FileText } from "lucide-react";

export default function ProposalRequestPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    timeline: "",
    budget: "",
    details: "",
  });

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    toast({
      title: "Proposal request received",
      description: "We’ll review your details and respond with next steps.",
    });
    setFormData({
      name: "",
      email: "",
      company: "",
      role: "",
      timeline: "",
      budget: "",
      details: "",
    });
  };

  return (
    
      
        
          Proposal Request
          Request a tailored proposal.
          
            Tell us about your goals, timeline, and success criteria. We’ll craft a proposal that matches your ABM objectives.
          
        

        
          
            
              Project details
              Share the essentials so we can scope accurately.
            
            
              
                
                  
                    Full Name
                     handleChange("name", e.target.value)}
                      placeholder="Jane Doe"
                      required
                    />
                  
                  
                    Work Email
                     handleChange("email", e.target.value)}
                      placeholder="jane@company.com"
                      required
                    />
                  
                
                
                  
                    Company
                     handleChange("company", e.target.value)}
                      placeholder="Company name"
                      required
                    />
                  
                  
                    Role / Title
                     handleChange("role", e.target.value)}
                      placeholder="VP Demand Gen"
                    />
                  
                
                
                  
                    Desired timeline
                     handleChange("timeline", e.target.value)}
                      placeholder="Launch in 6-8 weeks"
                    />
                  
                  
                    Budget range
                     handleChange("budget", e.target.value)}
                      placeholder="$25k - $50k / quarter"
                    />
                  
                
                
                  Goals & success criteria
                   handleChange("details", e.target.value)}
                    placeholder="Describe campaign goals, target accounts, lead volume, or any constraints."
                    rows={5}
                    required
                  />
                
                
                  
                  Request proposal
                
                {submitted && (
                  Thanks! We’ll follow up within one business day.
                )}
              
            
          

          
            
              What happens next
              We’ll align quickly and move fast.
            
            
              
                
                
                  Review & scope
                  We confirm goals, target accounts, and success metrics.
                
              
              
                
                
                  Timeline alignment
                  Expect a tailored proposal and delivery plan.
                
              
              
                
                
                  Proposal delivery
                  We provide clear scope, pricing, and next steps.
                
              
            
          
        
      
    
  );
}