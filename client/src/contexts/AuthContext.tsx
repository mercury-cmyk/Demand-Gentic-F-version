import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '@shared/schema';

interface AuthContextType {
  user: Omit<User, 'password'> | null;
  token: string | null;
  login: (token: string, user: Omit<User, 'password'>) => void;
  logout: () => void;
  getToken: () => string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<User, 'password'> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load auth state from localStorage on mount and validate token
  useEffect(() => {
    const validateAndLoadAuth = async () => {
      const storedToken = localStorage.getItem('authToken');
      const storedUser = localStorage.getItem('authUser');
      
      if (storedToken && storedUser) {
        // First set the state immediately
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        
        // Then validate the token in the background
        try {
          const response = await fetch('/api/dashboard/stats', {
            headers: {
              'Authorization': `Bearer ${storedToken}`
            }
          });
          
          if (!response.ok && (response.status === 401 || response.status === 403)) {
            // Only clear if we get a definite auth failure
            console.log('[AUTH] Token validation failed, clearing auth state');
            setToken(null);
            setUser(null);
            localStorage.removeItem('authToken');
            localStorage.removeItem('authUser');
          }
          // If we get other errors (500, network issues, etc.), keep the token
        } catch (error) {
          // On network errors, keep the user logged in
          console.warn('[AUTH] Token validation error (keeping user logged in):', error);
        }
      }
      
      setIsLoading(false);
    };
    
    validateAndLoadAuth();
  }, []);

  const login = (newToken: string, newUser: Omit<User, 'password'>) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('authUser', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  };

  const getToken = () => {
    return token || localStorage.getItem('authToken');
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        token, 
        login, 
        logout, 
        getToken,
        isAuthenticated: !!token && !!user,
        isLoading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
