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
      console.log('[LOGIN] Authentication confirmed, redirecting to /');
      setLocation("/");
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Premium gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-teal-accent/5 to-background"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-teal-accent/10 rounded-full blur-3xl"></div>
      
      <Card className="w-full max-w-md relative shadow-smooth-lg border-0 animate-fade-in">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 shrink-0 shadow-sm">
                <div className="relative flex items-center justify-center">
                  <span className="font-bold text-xl text-primary tracking-tighter">DG</span>
                  <Sparkles className="h-4 w-4 text-blue-500 absolute -top-1.5 -right-2" />
                </div>
              </div>
            </div>
          </div>
          <CardTitle className="text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            DemandGentic.ai
          </CardTitle>
          <div className="text-muted-foreground font-medium text-xs uppercase tracking-widest mt-1 mb-2">Human Intel, AI Execute By DemandGentic</div>
          <CardDescription className="text-base">
            Intelligent B2B demand generation platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showMfaInput ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium">Username</Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  data-testid="input-username"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                  className="h-11"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                  />
                  Keep me signed in for 30 days
                </label>
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Button 
                type="submit" 
                className="w-full h-11 text-base font-semibold shadow-smooth" 
                data-testid="button-login" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mfa-token" className="text-sm font-medium">
                  {useBackupCode ? 'Backup Code' : 'Authentication Code'}
                </Label>
                <Input
                  id="mfa-token"
                  type="text"
                  placeholder={useBackupCode ? 'Enter backup code' : 'Enter 6-digit code'}
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value)}
                  required
                  className="h-11 text-center text-xl tracking-widest"
                  maxLength={useBackupCode ? 10 : 6}
                  autoFocus
                />
              </div>
              <Button 
                type="submit" 
                className="w-full h-11 text-base font-semibold shadow-smooth" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setUseBackupCode(!useBackupCode)}
                  className="text-primary hover:underline"
                >
                  {useBackupCode ? 'Use authenticator code' : 'Use backup code'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMfaInput(false);
                    setMfaToken('');
                    setUseBackupCode(false);
                  }}
                  className="text-muted-foreground hover:underline"
                >
                  Back to login
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
