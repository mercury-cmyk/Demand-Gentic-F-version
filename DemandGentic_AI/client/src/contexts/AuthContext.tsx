import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '@shared/schema';

interface AuthContextType {
  user: Omit | null;
  token: string | null;
  login: (token: string, user: Omit) => void;
  logout: () => void;
  getToken: () => string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext(undefined);
const AUTH_VALIDATION_TIMEOUT_MS = 8000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState | null>(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load auth state from localStorage on mount and validate token
  useEffect(() => {
    const validateAndLoadAuth = async () => {
      try {
        const storedToken = localStorage.getItem('authToken');
        const storedUser = localStorage.getItem('authUser');

        if (storedToken && storedUser) {
          let parsedUser: Omit | null = null;
          try {
            parsedUser = JSON.parse(storedUser);
          } catch (parseError) {
            console.warn('[AUTH] Corrupted authUser payload in localStorage, clearing auth state:', parseError);
            localStorage.removeItem('authToken');
            localStorage.removeItem('authUser');
          }

          if (parsedUser) {
            // Set auth state immediately so UI can render even if validation endpoint is slow.
            setToken(storedToken);
            setUser(parsedUser);

            // Validate token with a hard timeout so startup never hangs forever.
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => {
              controller.abort();
            }, AUTH_VALIDATION_TIMEOUT_MS);

            try {
              const response = await fetch('/api/auth/session', {
                headers: {
                  'Authorization': `Bearer ${storedToken}`
                },
                signal: controller.signal,
              });

              if (!response.ok && (response.status === 401 || response.status === 403)) {
                // Only clear if we get a definite auth failure.
                console.log('[AUTH] Token validation failed, clearing auth state');
                setToken(null);
                setUser(null);
                localStorage.removeItem('authToken');
                localStorage.removeItem('authUser');
              }
              // If we get other errors (500, network issues, etc.), keep the token.
            } catch (error) {
              // On network errors/timeouts, keep the user logged in.
              console.warn('[AUTH] Token validation error (keeping user logged in):', error);
            } finally {
              window.clearTimeout(timeoutId);
            }
          }
        }
      } finally {
        // Always release loading state, even if validation hangs/errors.
        setIsLoading(false);
      }
    };
    
    validateAndLoadAuth();
  }, []);

  const login = (newToken: string, newUser: Omit) => {
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
    
      {children}
    
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}