import { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Building2, ShieldCheck, Mail, Lock, Loader2 } from 'lucide-react';
import { setClientPortalSession } from '@/lib/client-portal-session';

interface InviteDetails {
  clientName: string;
  allowedDomains: string[];
  joinUrl: string;
}

export default function ClientPortalJoin() {
  const [, params] = useRoute('/client-portal/join/:slug');
  const [, setLocation] = useLocation();
  const slug = params?.slug ?? '';
  const { toast } = useToast();

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadInvite = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/client-portal/invite/${slug}`);
        if (!res.ok) {
          throw new Error('Invite not found or disabled');
        }
        const data = await res.json();
        setInvite(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Invite not found');
      } finally {
        setLoading(false);
      }
    };

    if (slug) loadInvite();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/client-portal/invite/${slug}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, firstName, lastName }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Unable to create account');
      }

      const data = await res.json();
      // Use centralized session setter to clear previous tenant cache
      setClientPortalSession(data.token, data.user);
      toast({ title: 'Account created. Welcome aboard!' });
      setLocation('/client-portal/dashboard');
    } catch (err: any) {
      toast({ title: 'Signup failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      
        
          
          Checking invite…
        
      
    );
  }

  if (error || !invite) {
    return (
      
        
          
            Invite unavailable
            {error || 'This invite link is no longer active.'}
          
          
             setLocation('/client-portal/login')}>
              Go to login
            
          
        
      
    );
  }

  return (
    
      
        
          
            
          
          Join {invite.clientName}
          
            Self-serve access is locked to company email domains.
          
          
            
            Domain restricted
          
          
            {invite.allowedDomains.length > 0 ? (
              invite.allowedDomains.map((domain) => (
                
                  {domain}
                
              ))
            ) : (
              
                Admin approval required
              
            )}
          
        

        
          
            
              Work Email
              
                
                 setEmail(e.target.value)}
                />
              
            
            
              Create Password
              
                
                 setPassword(e.target.value)}
                />
              
            
            
              
                First name
                 setFirstName(e.target.value)}
                />
              
              
                Last name
                 setLastName(e.target.value)}
                />
              
            
          
          
            
              {submitting ?  : null}
              {submitting ? 'Creating your access…' : 'Join portal'}
            
             setLocation('/client-portal/login')}>
              Already have an account? Sign in
            
          
        
      
    
  );
}