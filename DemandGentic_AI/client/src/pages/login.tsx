import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [showMfaInput, setShowMfaInput] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Redirect after successful login once authentication state is updated
  useEffect(() => {
    if (loginSuccess && isAuthenticated) {
      console.log('[LOGIN] Authentication confirmed, redirecting to /dashboard');
      setLocation("/dashboard");
    }
  }, [loginSuccess, isAuthenticated, setLocation]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[LOGIN] Form submitted, username:', username);
    setIsLoading(true);
    setLoginSuccess(false);

    try {
      console.log('[LOGIN] Sending POST request to /api/auth/login');
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password, rememberMe }),
      });

      console.log('[LOGIN] Response status:', response.status);
      const data = await response.json();
      console.log('[LOGIN] Response data:', data);

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      // Check if MFA is required
      if (data.requiresMFA && data.mfaType === 'totp') {
        console.log('[LOGIN] TOTP MFA required, showing input');
        setShowMfaInput(true);
        setIsLoading(false);
        toast({
          title: "Multi-Factor Authentication Required",
          description: "Please enter your authentication code",
        });
        return;
      }

      // Store auth data (no MFA required)
      console.log('[LOGIN] Calling login() with token and user');
      login(data.token, data.user);
      
      // Set success flag to trigger redirect in useEffect after state updates
      setLoginSuccess(true);
      
      toast({
        title: "Welcome back!",
        description: `Logged in as ${data.user.username}`,
      });
    } catch (error) {
      console.error('[LOGIN] Error during login:', error);
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error instanceof Error ? error.message : "Invalid credentials",
      });
      setIsLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          username, 
          password, 
          token: mfaToken,
          useBackupCode,
          rememberMe,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "MFA verification failed");
      }

      // Store auth data
      login(data.token, data.user);
      setLoginSuccess(true);
      
      toast({
        title: "Welcome back!",
        description: `Logged in as ${data.user.username}`,
      });
    } catch (error) {
      console.error('[MFA VERIFY] Error:', error);
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Invalid code",
      });
      setIsLoading(false);
    }
  };

  return (
    
      {/* Premium gradient background */}
      
      
      
      
      
        
          
            
              
                
                  PB
                  
                
              
            
          
          
            Pivotal B2B
          
          DemandGentic---Human-Led Strategy. AI-Powered Execution.
          
            Intelligent B2B demand generation platform
          
        
        
          {!showMfaInput ? (
            
              
                Username
                 setUsername(e.target.value)}
                  required
                  data-testid="input-username"
                  className="h-11"
                />
              
              
                Password
                 setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                  className="h-11"
                />
              
              
                
                   setRememberMe(checked === true)}
                  />
                  Keep me signed in for 30 days
                
                
                  Forgot password?
                
              
              
                {isLoading ? (
                  <>
                    
                    Signing in...
                  
                ) : (
                  'Sign In'
                )}
              
            
          ) : (
            
              
                
                  {useBackupCode ? 'Backup Code' : 'Authentication Code'}
                
                 setMfaToken(e.target.value)}
                  required
                  className="h-11 text-center text-xl tracking-widest"
                  maxLength={useBackupCode ? 10 : 6}
                  autoFocus
                />
              
              
                {isLoading ? (
                  <>
                    
                    Verifying...
                  
                ) : (
                  'Verify'
                )}
              
              
                 setUseBackupCode(!useBackupCode)}
                  className="text-primary hover:underline"
                >
                  {useBackupCode ? 'Use authenticator code' : 'Use backup code'}
                
                 {
                    setShowMfaInput(false);
                    setMfaToken('');
                    setUseBackupCode(false);
                  }}
                  className="text-muted-foreground hover:underline"
                >
                  Back to login
                
              
            
          )}
        
      
    
  );
}