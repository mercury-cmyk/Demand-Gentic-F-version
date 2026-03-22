import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Lock, Mail, Loader2, Sparkles } from 'lucide-react';
import { setClientPortalSession } from '@/lib/client-portal-session';

export default function ClientPortalLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/client-portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => null as any);

      if (!response.ok) {
        throw new Error(data?.message || `Login failed (${response.status})`);
      }
      setClientPortalSession(data.token, data.user);
      toast({ title: 'Login successful' });
      setLocation('/client-portal/dashboard');
    } catch (error) {
      toast({
        title: 'Login failed',
        description: error instanceof Error ? error.message : 'Please check your credentials',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    
      {/* Premium gradient background */}
      
      
      

      
        
          
            
              
                PB
                
              
            
          
          
            Client Portal
          
          
            Human-Led Strategy. AI-Powered Execution. Built for B2B Demand
          
          
            Intelligent B2B demand generation platform
          
        
        
          
            
              Email
              
                
                 setEmail(e.target.value)}
                  className="pl-10 h-11"
                  required
                  data-testid="input-email"
                />
              
            
            
              Password
              
                
                 setPassword(e.target.value)}
                  className="pl-10 h-11"
                  required
                  autoComplete="current-password"
                  data-testid="input-password"
                />
              
            
            
              
                Forgot password?
              
            
          
          
            
              {isLoading ? (
                <>
                  
                  Signing in...
                
              ) : (
                'Sign In'
              )}
            
          
        
      
    
  );
}