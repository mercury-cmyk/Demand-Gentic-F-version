import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, ArrowLeft, Mail, CheckCircle2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [userType, setUserType] = useState("internal");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Check URL params for pre-selected type
  const params = new URLSearchParams(window.location.search);
  const initialType = params.get("type");
  if (initialType === "client" && userType === "internal" && !submitted) {
    setUserType("client");
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, userType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to process request");
      }

      setSubmitted(true);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Something went wrong",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    
      
      
      

      
        
          
            
              
                DG
                
              
            
          
          Reset Password
          
            {submitted
              ? "Check your email for a reset link"
              : "Enter your email to receive a password reset link"}
          
        
        
          {submitted ? (
            
              
                
                
                  If an account exists with {email}, you will receive a password reset link shortly.
                
              
              
                
                  
                  Back to Login
                
              
            
          ) : (
            
              
                Email Address
                
                  
                   setEmail(e.target.value)}
                    required
                    className="h-11 pl-10"
                  />
                
              

              
                Account Type
                 setUserType(v as "internal" | "client")}
                  className="flex gap-4"
                >
                  
                    
                    Internal User
                  
                  
                    
                    Client Portal
                  
                
              

              
                {isLoading ? (
                  <>
                    
                    Sending...
                  
                ) : (
                  "Send Reset Link"
                )}
              

              
                
                  
                  Back to Login
                
              
            
          )}
        
      
    
  );
}