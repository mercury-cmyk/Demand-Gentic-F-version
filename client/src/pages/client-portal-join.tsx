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

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white">
        <div className="flex items-center gap-3 text-lg">
          <Loader2 className="h-5 w-5 animate-spin" />
          Checking invite…
        </div>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">
        <Card className="w-full max-w-md bg-card/80 backdrop-blur">
          <CardHeader className="text-center">
            <CardTitle>Invite unavailable</CardTitle>
            <CardDescription>{error || 'This invite link is no longer active.'}</CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center">
            <Button variant="outline" onClick={() => setLocation('/client-portal/login')}>
              Go to login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4 text-white">
      <Card className="w-full max-w-xl bg-card/90 backdrop-blur">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Join {invite.clientName}</CardTitle>
          <CardDescription className="text-muted-foreground">
            Self-serve access is locked to company email domains.
          </CardDescription>
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Domain restricted</span>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {invite.allowedDomains.length > 0 ? (
              invite.allowedDomains.map((domain) => (
                <Badge key={domain} variant="outline" className="bg-muted/50 text-xs">
                  {domain}
                </Badge>
              ))
            ) : (
              <Badge variant="outline" className="bg-muted/50 text-xs">
                Admin approval required
              </Badge>
            )}
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 text-foreground">
            <div className="space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  className="pl-10"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Create Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  className="pl-10"
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  placeholder="Jane"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {submitting ? 'Creating your access…' : 'Join portal'}
            </Button>
            <Button variant="outline" type="button" className="w-full" onClick={() => setLocation('/client-portal/login')}>
              Already have an account? Sign in
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

