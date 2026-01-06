import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

export default function ForceLogoutPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Force clear all auth data
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear any cached tokens
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    
    console.log('[FORCE LOGOUT] All storage cleared');
    
    // Redirect to login after a brief delay
    setTimeout(() => {
      setLocation("/login");
      window.location.reload();
    }, 1500);
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Logout Successful
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            All session data has been cleared. Redirecting to login...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
