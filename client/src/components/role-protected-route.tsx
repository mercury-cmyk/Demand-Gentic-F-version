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

const parseJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');

  try {
    const json = atob(padded);
    return JSON.parse(json);
  } catch (error) {
    console.warn('[AUTH] Failed to parse JWT payload:', error);
    return null;
  }
};

// Get user roles from various sources (user object, token, legacy role field)
export function getUserRoles(user: any, token: string | null, getToken?: () => string | null): string[] {
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="bg-destructive/10 p-4 rounded-full mb-6">
          <Shield className="h-12 w-12 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          You don't have permission to access this page.
          Your current role{userRoles.length > 1 ? 's' : ''}: <strong>{userRoles.join(', ')}</strong>
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Required role{allowedRoles.length > 1 ? 's' : ''}: {allowedRoles.join(', ')}
        </p>
        <Button onClick={() => setLocation(fallbackPath)} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go to Dashboard
        </Button>
      </div>
    );
  }

  return <>{children}</>;
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
