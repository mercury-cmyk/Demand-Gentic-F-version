import { useState, useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Lock, User, Loader2, Sparkles, CheckCircle2, XCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';

interface InviteUser {
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string;
}

export default function ClientPortalAcceptInvite() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const clientPortalLoginPath = '/client-portal/login';

  // Token from URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';

  // State
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [invalidReason, setInvalidReason] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [user, setUser] = useState<InviteUser | null>(null);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Password strength
  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const passwordStrength = Object.values(passwordChecks).filter(Boolean).length;

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setIsValidating(false);
      setIsValid(false);
      setInvalidReason('No invitation token provided. Please use the link from your invitation email.');
      return;
    }

    const validateToken = async () => {
      try {
        const response = await fetch('/api/communications/invitations/validate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (data.valid && data.user) {
          setIsValid(true);
          setUser(data.user);
          setFirstName(data.user.firstName || '');
          setLastName(data.user.lastName || '');
        } else {
          setIsValid(false);
          setInvalidReason(data.reason || 'This invitation link is invalid or has expired. Please contact your administrator for a new invitation.');
          setErrorCode(data.errorCode || '');
        }
      } catch {
        setIsValid(false);
        setInvalidReason('Unable to validate your invitation. Please check your connection and try again.');
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    if (passwordStrength < 3) {
      toast({ title: 'Password is too weak', description: 'Please meet at least 3 of the 4 requirements.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/communications/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, firstName, lastName }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to set up your account');
      }

      setIsComplete(true);
      toast({ title: 'Account set up successfully!' });
    } catch (error) {
      toast({
        title: 'Setup failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-teal-accent/5 to-background" />
        <Card className="w-full max-w-md relative shadow-smooth-lg border-0">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Validating your invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid token state
  if (!isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-background to-background" />
        <Card className="w-full max-w-md relative shadow-smooth-lg border-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-6">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Invitation Invalid</h2>
            <p className="text-muted-foreground mb-6 max-w-sm">{invalidReason}</p>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              {errorCode === 'TOKEN_USED' ? (
                <Link href={clientPortalLoginPath}>
                  <Button className="w-full">Go to Login</Button>
                </Link>
              ) : (
                <Link href={clientPortalLoginPath}>
                  <Button variant="outline" className="w-full">Go to Login</Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-teal-accent/5 to-background" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
        <Card className="w-full max-w-md relative shadow-smooth-lg border-0 animate-fade-in">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-6">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">You're All Set!</h2>
            <p className="text-muted-foreground mb-2">
              Welcome to the <strong>{user?.companyName}</strong> portal.
            </p>
            <p className="text-muted-foreground mb-8 text-sm">
              Your password has been set. You can now log in with your email.
            </p>
            <Link href={clientPortalLoginPath}>
              <Button size="lg" className="px-8">
                Log In to Your Portal
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Setup form
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-teal-accent/5 to-background" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-teal-accent/10 rounded-full blur-3xl" />

      <Card className="w-full max-w-md relative shadow-smooth-lg border-0 animate-fade-in">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 shrink-0 shadow-sm">
              <div className="relative flex items-center justify-center">
                <span className="font-bold text-xl text-primary tracking-tighter">PB</span>
                <Sparkles className="h-4 w-4 text-blue-500 absolute -top-1.5 -right-2" />
              </div>
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Set Up Your Account</CardTitle>
          <CardDescription>
            Complete your profile for the <strong>{user?.companyName}</strong> workspace
          </CardDescription>
          {user?.email && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md py-1.5 px-3 inline-block mt-2">
              {user.email}
            </p>
          )}
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Name fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sm font-medium">First Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                    required
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm font-medium">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Create Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a strong password"
                  required
                  className="pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="space-y-2 mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          passwordStrength >= level
                            ? passwordStrength <= 1
                              ? 'bg-red-500'
                              : passwordStrength <= 2
                              ? 'bg-orange-500'
                              : passwordStrength <= 3
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                            : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {[
                      { check: passwordChecks.length, label: '8+ characters' },
                      { check: passwordChecks.uppercase, label: 'Uppercase letter' },
                      { check: passwordChecks.lowercase, label: 'Lowercase letter' },
                      { check: passwordChecks.number, label: 'Number' },
                    ].map(({ check, label }) => (
                      <p key={label} className={`text-xs flex items-center gap-1 ${check ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {check ? <CheckCircle2 className="h-3 w-3" /> : <span className="w-3 h-3 rounded-full border border-muted-foreground/30 inline-block" />}
                        {label}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  className="pl-10"
                />
              </div>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> Passwords do not match
                </p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isSubmitting || passwordStrength < 3 || password !== confirmPassword || !firstName || !lastName}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up your account...
                </>
              ) : (
                'Complete Setup'
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Already have an account?{' '}
              <Link href={clientPortalLoginPath} className="text-primary hover:underline">
                Log in instead
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
