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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
