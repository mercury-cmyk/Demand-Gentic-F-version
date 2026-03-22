import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

export function ClientPortalProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('clientPortalToken');
      const user = localStorage.getItem('clientPortalUser');

      if (!token || !user) {
        setIsAuthenticated(false);
        setLocation('/client-portal/login');
      } else {
        // Optional: Validate token expiration if it's a JWT
        setIsAuthenticated(true);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, [setLocation]);

  if (isLoading) {
    return (
      
        
      
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children};
}