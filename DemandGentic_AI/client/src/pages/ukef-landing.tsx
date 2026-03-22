import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  CheckCircle2, 
  ArrowRight, 
  Download, 
  Phone, 
  FileText, 
  Globe, 
  ShieldCheck,
  Building2,
  TrendingUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function UkefLandingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    phone: "",
    consent: false,
    interestedInCall: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Parse query parameters to pre-fill form
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFormData(prev => ({
      ...prev,
      firstName: params.get("firstName") || "",
      lastName: params.get("lastName") || "",
      email: params.get("email") || "",
      company: params.get("company") || "",
      phone: params.get("phone") || "",
    }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.consent) {
      toast({
        title: "Consent Required",
        description: "Please consent to receive the white paper.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
      toast({
        title: "Success",
        description: "Thank you for your interest. The white paper will be sent to your email shortly.",
      });
    }, 1500);
  };

  if (isSuccess) {
    return (
      
        {/* Simple Header */}
        
          
            
              
              UK Export Finance
            
          
        

        
          
            
              
                
              
              Thank You!
              
                Your request has been received.
              
            
            
              
                We've sent the "Leading with Finance" white paper to {formData.email}.
              
              {formData.interestedInCall && (
                
                  Next Steps
                  One of our specialists will be in touch shortly to discuss your export finance needs.
                
              )}
               setLocation("/")}
              >
                Return to Home
              
            
          
        
      
    );
  }

  return (
    
      {/* Header */}
      
        
          
             
                
             
             UK Export Finance
          
        
      

      
        {/* Hero Section */}
        
          
            
              
                
                Global Growth Opportunities
              
              
                Minimize Risk. Maximize Growth.
              
              
                Discover how government-backed finance can help your UK business win contracts, 
                fulfill orders, and get paid. Get your free copy of the "Leading with Finance" white paper.
              
              
                
                   Government Backed
                
                
                   Export Support
                
                
                   Financial Security
                
              
            

            {/* Form Card */}
            
              
                
                  Get Your Free White Paper
                  
                    Verify your details below to receive the guide instantly.
                  
                
                
                  
                    
                      
                        First Name
                         setFormData({...formData, firstName: e.target.value})}
                          required 
                        />
                      
                      
                        Last Name
                         setFormData({...formData, lastName: e.target.value})}
                          required 
                        />
                      
                    

                    
                      Work Email
                       setFormData({...formData, email: e.target.value})}
                        required 
                      />
                    

                    
                      Company Name
                       setFormData({...formData, company: e.target.value})}
                        required 
                      />
                    

                    
                      
                          setFormData({...formData, consent: checked as boolean})}
                         />
                         
                            
                                I consent to receive the "Leading with Finance" white paper via email.
                            
                            
                                You can unsubscribe at any time.
                            
                         
                      

                      
                          setFormData({...formData, interestedInCall: checked as boolean})}
                         />
                         
                            
                                I am interested in a brief follow-up call to discuss export finance needs.
                            
                         
                      
                    

                    
                      {isSubmitting ? "Processing..." : "Send Me The White Paper"}
                      {!isSubmitting && }
                    
                  
                
              
            
          
        

        {/* Key Talking Points Section */}
        
          
            
              What's Inside The Guide?
              
                Essential knowledge for UK businesses looking to expand internationally while managing financial risk.
              
            

            
              
                
                  
                  Financing Options
                
                
                  
                    Explore comprehensive financing solutions designed to help you fulfill export contracts and manage working capital effectively.
                  
                
              

              
                
                  
                  Contract Solutions
                
                
                  
                    Learn how to protect your business against non-payment and other risks associated with international trade contracts.
                  
                
              

              
                
                  
                  Financial Resources
                
                
                  
                    Access government-backed financial resources and support systems available specifically for UK exporters like you.
                  
                
              
            
          
        
        
        {/* About Section */}
        
          
            About UK Export Finance
            
                We are the UK's export credit agency. We help UK companies to:
            
            
                
                    
                        
                    
                    
                        Win Contracts
                        By providing attractive financing terms to your buyers.
                    
                
                
                    
                        
                    
                    
                        Fulfill Orders
                        By supporting working capital loans.
                    
                
                
                    
                        
                    
                    
                        Get Paid
                        By insuring against buyer default.
                    
                
            
          
        

        {/* Footer */}
        
          
            
               
               UK Export Finance
            
            
              Helping UK businesses succeed in international markets.
            
            
              © {new Date().getFullYear()} ukexportfinance.gov.uk. All rights reserved.
            
          
        
      
    
  );
}