import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { USER_ROLES } from '@/lib/navigation-config';
import { Shield, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Utility to normalize role from various formats
const normalizeRole = (role: unknown): string | null => {
  if (typeof role === 'string') {
    const trimmed = role.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }
  if (role && typeof role === 'object' && 'role' in role) {
    const value = (role as { role?: unknown }).role;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed.toLowerCase() : null;
    }
  }
  return null;
};

const normalizeRoles = (roles: unknown): string[] => {
  if (roles == null) {
    return [];
  }
  const roleList = Array.isArray(roles) ? roles : [roles];
  const normalized: string[] = [];

  roleList.forEach((role) => {
    const direct = normalizeRole(role);
    if (direct) {
      if (direct.includes(',') || direct.includes(' ')) {
        direct
          .split(/[,\s]+/)
          .map((entry) => entry.trim())
          .filter(Boolean)
          .forEach((entry) => normalized.push(entry.toLowerCase()));
      } else {
        normalized.push(direct);
      }
      return;
    }

    if (role && typeof role === 'object' && 'role' in role) {
      const nested = normalizeRole((role as { role?: unknown }).role);
      if (nested) {
        normalized.push(nested);
      }
    }
  });

  return normalized;
};

const parseJwtPayload = (token: string): Record | null => {
  const parts = token.split('.');
  if (parts.length  string | null): string[] {
  const rolesFromUser = normalizeRoles((user as any)?.roles);
  const rolesFromLegacy = normalizeRoles(user?.role);
  const authToken = token || (getToken ? getToken() : null);
  const tokenPayload = authToken ? parseJwtPayload(authToken) : null;
  const rolesFromToken = normalizeRoles(tokenPayload?.roles ?? tokenPayload?.role);

  const userRoles = Array.from(new Set([
    ...rolesFromUser,
    ...rolesFromLegacy,
    ...rolesFromToken,
  ]));

  // Default to 'agent' if no roles found
  return userRoles.length > 0 ? userRoles : ['agent'];
}

// Check if user has any of the allowed roles
export function hasRequiredRole(userRoles: string[], allowedRoles: string[]): boolean {
  // Admin always has access
  if (userRoles.includes(USER_ROLES.ADMIN)) {
    return true;
  }

  // Check if user has any of the allowed roles
  return allowedRoles.some(role => userRoles.includes(role.toLowerCase()));
}

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
  fallbackPath?: string;
}

export function RoleProtectedRoute({
  children,
  allowedRoles,
  fallbackPath = '/'
}: RoleProtectedRouteProps) {
  const { user, token, getToken, isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  // Get user roles
  const userRoles = getUserRoles(user, token, getToken);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      
        
      
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    setLocation('/login');
    return null;
  }

  // Check if user has required role
  if (!hasRequiredRole(userRoles, allowedRoles)) {
    return (
      
        
          
        
        Access Denied
        
          You don't have permission to access this page.
          Your current role{userRoles.length > 1 ? 's' : ''}: {userRoles.join(', ')}
        
        
          Required role{allowedRoles.length > 1 ? 's' : ''}: {allowedRoles.join(', ')}
        
         setLocation(fallbackPath)} variant="outline">
          
          Go to Dashboard
        
      
    );
  }

  return <>{children};
}

// Hook to check if user has a specific role
export function useHasRole(allowedRoles: string[]): boolean {
  const { user, token, getToken } = useAuth();
  const userRoles = getUserRoles(user, token, getToken);
  return hasRequiredRole(userRoles, allowedRoles);
}

// Hook to get current user's roles
export function useUserRoles(): string[] {
  const { user, token, getToken } = useAuth();
  return getUserRoles(user, token, getToken);
}