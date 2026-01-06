import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);

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
        body: JSON.stringify({ username, password }),
      });

      console.log('[LOGIN] Response status:', response.status);
      const data = await response.json();
      console.log('[LOGIN] Response data:', data);

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      // Store auth data
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Premium gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-teal-accent/5 to-background"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-teal-accent/10 rounded-full blur-3xl"></div>
      
      <Card className="w-full max-w-md relative shadow-smooth-lg border-0 animate-fade-in">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img
              src="/demangent-logo.png"
              alt="DemanGent.ai"
              className="h-12 w-auto"
            />
          </div>
          <CardTitle className="text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            DemanGent.ai
          </CardTitle>
          <CardDescription className="text-base">
            Intelligent B2B demand generation platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">Username</Label>
              <Input
                id="username"
                type="text"
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
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-password"
                className="h-11"
              />
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
        </CardContent>
      </Card>
    </div>
  );
}
