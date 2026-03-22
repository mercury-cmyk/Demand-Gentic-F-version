import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ResetPasswordPage() {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const userType = params.get("type") || "internal";
  const loginPath = userType === "client" ? "/client-portal/login" : "/login";

  if (!token) {
    return (
      
        
        
          
            
              
              
                Invalid reset link. Please request a new password reset.
              
            
            
              Request New Reset Link
            
          
        
      
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same",
      });
      return;
    }

    if (newPassword.length 
      
      
      

      
        
          
            
              
                DG
                
              
            
          
          
            {success ? "Password Reset" : "Set New Password"}
          
          
            {success
              ? "Your password has been updated"
              : "Enter your new password below"}
          
        
        
          {success ? (
            
              
                
                
                  Your password has been reset successfully. You can now log in with your new password.
                
              
              
                
                  Go to Login
                
              
            
          ) : (
            
              {error && (
                
                  {error}
                  {error.includes("expired") && (
                    
                      Request a new reset link
                    
                  )}
                
              )}

              
                New Password
                 setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-11"
                />
              

              
                Confirm Password
                 setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-11"
                />
              

              
                {isLoading ? (
                  <>
                    
                    Resetting...
                  
                ) : (
                  "Reset Password"
                )}
              

              
                
                  
                  Back to Login
                
              
            
          )}
        
      
    
  );
}