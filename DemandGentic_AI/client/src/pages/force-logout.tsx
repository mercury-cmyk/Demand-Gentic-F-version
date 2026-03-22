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
      const targetPath = window.location.pathname.startsWith('/client-portal')
        ? '/client-portal/login'
        : '/login';
      setLocation(targetPath);
      window.location.assign(targetPath);
    }, 1500);
  }, [setLocation]);

  return (
    
      
        
          
            
            Logout Successful
          
        
        
          
            All session data has been cleared. Redirecting to login...
          
        
      
    
  );
}