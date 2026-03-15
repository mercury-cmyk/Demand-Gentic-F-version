import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

type ExportAuthorityResponse = {
  hasAccess?: boolean;
};

export function useExportAuthority() {
  const { user, getToken } = useAuth();
  const token = getToken();
  const userRoles = (user as any)?.roles || [user?.role || ""];
  const hasExplicitSuperAdminRole = userRoles.includes("super_admin");

  const { data, isLoading } = useQuery<ExportAuthorityResponse>({
    queryKey: ["/api/super-org/check-access", "export-authority"],
    queryFn: async () => {
      const response = await fetch("/api/super-org/check-access", {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });

      if (!response.ok) {
        return { hasAccess: false };
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 60_000,
  });

  return {
    canExportData: hasExplicitSuperAdminRole || Boolean(data?.hasAccess),
    isExportAuthorityLoading: isLoading,
  };
}
