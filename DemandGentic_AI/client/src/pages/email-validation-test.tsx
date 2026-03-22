import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertCircle, Mail, Loader2 } from "lucide-react";

interface ValidationResult {
  email: string;
  duration: string;
  result: {
    status: string;
    confidence: number;
    summary: {
      syntaxValid: boolean;
      hasMx: boolean;
      hasSmtp: boolean;
      smtpAccepted: boolean;
      isRole: boolean;
      isFree: boolean;
      isDisposable: boolean;
      deliverability: string;
      isDeliverable: boolean;
    };
    trace: any;
  };
  metadata: {
    skipSmtpValidation: boolean;
    dnsCacheTtl: string;
    dnsTimeout: string;
    smtpTimeout: string;
  };
}

export default function EmailValidationTest() {
  const [email, setEmail] = useState("");
  const [testResult, setTestResult] = useState(null);

  const validateMutation = useMutation({
    mutationFn: async (emailToTest: string) => {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/test/email-validation/single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: emailToTest,
          skipCache: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Validation failed' }));
        throw new Error(errorData.error || errorData.message || 'Validation failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setTestResult(data);
    },
  });

  const handleTest = () => {
    if (email) {
      validateMutation.mutate(email);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && email && !validateMutation.isPending) {
      handleTest();
    }
  };

  return (
    
      
        Email Validation Test
        Test the email validation engine
      

      
        
          Test Email Address
        
        
          
             setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
              disabled={validateMutation.isPending}
            />
            
              {validateMutation.isPending ? (
                <>
                  
                  Testing...
                
              ) : (
                <>
                  
                  Test Email
                
              )}
            
          

          {validateMutation.isError && (
            
              
                Error: {validateMutation.error instanceof Error ? validateMutation.error.message : 'Validation failed'}
              
            
          )}

          {testResult && (
            
              
                Validation Results
                
                  {testResult.result.status}
                
                
                  Confidence: {testResult.result.confidence}%
                
                
                  {testResult.duration}
                
              

              
                
                  
                    
                      Format Valid
                      {testResult.result.summary.syntaxValid ? (
                        
                      ) : (
                        
                      )}
                    
                  
                

                
                  
                    
                      Domain Valid
                      {testResult.result.summary.hasMx ? (
                        
                      ) : (
                        
                      )}
                    
                  
                

                
                  
                    
                      SMTP Responded
                      {testResult.result.summary.hasSmtp ? (
                        
                      ) : (
                        
                      )}
                    
                  
                

                
                  
                    
                      SMTP Accepted
                      {testResult.result.summary.smtpAccepted ? (
                        
                      ) : (
                        
                      )}
                    
                  
                

                
                  
                    
                      Role Account
                      {testResult.result.summary.isRole ? (
                        
                      ) : (
                        
                      )}
                    
                  
                

                
                  
                    
                      Free Provider
                      {testResult.result.summary.isFree ? (
                        
                      ) : (
                        
                      )}
                    
                  
                

                
                  
                    
                      Disposable
                      {testResult.result.summary.isDisposable ? (
                        
                      ) : (
                        
                      )}
                    
                  
                

                
                  
                    
                      Deliverability
                      
                        {testResult.result.summary.deliverability}
                      
                    
                  
                
              

              {testResult.metadata && (
                
                  
                    Configuration
                  
                  
                    
                      
                        SMTP Validation:
                        {testResult.metadata.skipSmtpValidation ? 'Disabled' : 'Enabled'}
                      
                      
                        DNS Cache TTL:
                        {testResult.metadata.dnsCacheTtl}
                      
                      
                        DNS Timeout:
                        {testResult.metadata.dnsTimeout}
                      
                      
                        SMTP Timeout:
                        {testResult.metadata.smtpTimeout}
                      
                    
                  
                
              )}
            
          )}
        
      
    
  );
}