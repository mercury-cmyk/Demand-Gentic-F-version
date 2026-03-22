/**
 * Deprecated Route Redirect Component
 *
 * Handles redirects from deprecated routes to new locations.
 * Logs deprecation warnings to help developers update their bookmarks/links.
 */

import { useEffect } from 'react';
import { useLocation, Redirect } from 'wouter';
import { DEPRECATED_ROUTES, logRouteDeprecation, type DeprecatedRouteKey } from '@/lib/routes';

interface DeprecatedRedirectProps {
  routeKey: DeprecatedRouteKey;
}

/**
 * Component that handles deprecated route redirects with console warnings
 */
export function DeprecatedRedirect({ routeKey }: DeprecatedRedirectProps) {
  const route = DEPRECATED_ROUTES[routeKey];

  useEffect(() => {
    logRouteDeprecation(routeKey);
  }, [routeKey]);

  return ;
}

/**
 * Hook to check if current location is a deprecated route
 * Returns redirect info if deprecated, undefined otherwise
 */
export function useDeprecatedRouteCheck() {
  const [location] = useLocation();

  for (const key of Object.keys(DEPRECATED_ROUTES) as DeprecatedRouteKey[]) {
    const route = DEPRECATED_ROUTES[key];
    if (location === route.path || location.startsWith(route.path + '/')) {
      return { key, ...route };
    }
  }

  return undefined;
}

/**
 * Higher-order component to wrap pages with deprecation notices
 */
export function withDeprecationNotice(
  WrappedComponent: React.ComponentType,
  message: string
) {
  return function DeprecatedComponent(props: P) {
    useEffect(() => {
      console.warn(`[DEPRECATED PAGE] ${message}`);
    }, []);

    return ;
  };
}