import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, MapPin, Send } from "lucide-react";
import { BRAND } from "@shared/brand-messaging";

export default function ContactUsPage() {
  const { toast } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    message: "",
  });

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitted(true);
    toast({
      title: "Message received",
      description: "Thanks for reaching out. Our team will follow up shortly.",
    });
    setFormData({ name: "", email: "", company: "", message: "" });
  };

  return (
    
      
        
          Contact Us
          Let’s talk about your pipeline goals.
          
            Share a few details and we’ll connect you with the right specialist. We typically respond within one business day.
          
        

        
          
            
              Send a message
              Tell us what you’re building and how we can help.
            
            
              
                
                  
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
                  />
                
                
                  How can we help?
                   handleChange("message", e.target.value)}
                    placeholder="Tell us about your goals, timelines, or requirements."
                    rows={5}
                    required
                  />
                
                
                  
                  Send message
                
                {isSubmitted && (
                  Thanks! We’ll be in touch soon.
                )}
              
            
          

          
            
              Reach us directly
              Prefer a quick call or email? We’re ready.
            
            
              
                
                
                  Email
                  
                    {BRAND.domains.email.contact}
                  
                
              
              
                
                
                  Phone
                  
                    {BRAND.company.phone}
                  
                
              
              
                
                
                  Headquarters
                  {BRAND.company.location}
                
              
            
          
        
      
    
  );
}