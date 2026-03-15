import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Grid3X3, Scan, AlertTriangle } from "lucide-react";

interface CoverageMatrixTabProps {
  organizationId: string;
}

interface MappingRow {
  mapping: {
    id: string;
    publishedPageId: string;
    featureId: string;
    coverageDepth: string;
    aiConfidence: number | null;
  };
  featureName: string;
  featureSlug: string;
  featureCategory: string | null;
  featureStatus: string;
  pageTitle: string;
  pageSlug: string;
}

const DEPTH_COLORS: Record<string, string> = {
  primary: "bg-green-500 text-white",
  detailed: "bg-blue-500 text-white",
  mentioned: "bg-yellow-400 text-yellow-900",
};

export default function CoverageMatrixTab({ organizationId }: CoverageMatrixTabProps) {
  const queryClient = useQueryClient();

  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ["content-governance", "health", organizationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/content-governance/health/${organizationId}`);
      return res.json();
    },
    enabled: !!organizationId,
  });

  const { data: mappingsData, isLoading: mappingsLoading } = useQuery({
    queryKey: ["content-governance", "mappings", organizationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/content-governance/mappings?organizationId=${organizationId}`);
      return res.json();
    },
    enabled: !!organizationId,
  });

  const { data: featuresData } = useQuery({
    queryKey: ["content-governance", "features", organizationId, "active"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/content-governance/features?organizationId=${organizationId}&status=active`);
      return res.json();
    },
    enabled: !!organizationId,
  });

  const isLoading = healthLoading || mappingsLoading;
  const pages = healthData?.pages || [];
  const features = featuresData?.features || [];
  const mappings: MappingRow[] = mappingsData?.mappings || [];
  const uncoveredFeatures = healthData?.uncoveredFeatures || [];

  // Build matrix: feature -> page -> mapping
  function getMappingForCell(featureId: string, pageId: string): MappingRow | undefined {
    return mappings.find(m => m.mapping.featureId === featureId && m.mapping.publishedPageId === pageId);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading coverage data...
      </div>
    );
  }

  if (features.length === 0 && pages.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Grid3X3 className="h-10 w-10 mb-3 opacity-50" />
          <p className="text-sm">No features or pages to display.</p>
          <p className="text-xs mt-1">Add features in the Feature Registry and publish pages to see coverage.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold">{healthData?.totalFeatures || 0}</div>
            <div className="text-xs text-muted-foreground">Active Features</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold">{healthData?.totalPages || 0}</div>
            <div className="text-xs text-muted-foreground">Published Pages</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold">{healthData?.totalMappings || 0}</div>
            <div className="text-xs text-muted-foreground">Feature-Page Links</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-destructive">{uncoveredFeatures.length}</div>
            <div className="text-xs text-muted-foreground">Uncovered Features</div>
          </CardContent>
        </Card>
      </div>

      {/* Uncovered Features Alert */}
      {uncoveredFeatures.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Coverage Gaps — Features with No Page
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="flex flex-wrap gap-2">
              {uncoveredFeatures.map((f: any) => (
                <Badge key={f.id} variant="outline" className="bg-white">
                  {f.name} {f.category && <span className="text-muted-foreground ml-1">({f.category})</span>}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coverage Matrix */}
      {features.length > 0 && pages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Coverage Matrix</CardTitle>
            <CardDescription>Features (rows) vs. Published Pages (columns). Color indicates coverage depth.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 border-b font-medium min-w-[160px]">Feature</th>
                  {pages.map((page: any) => (
                    <th key={page.id} className="p-2 border-b font-medium text-center min-w-[100px] max-w-[140px] truncate" title={page.title}>
                      {page.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((feature: any) => (
                  <tr key={feature.id}>
                    <td className="p-2 border-b font-medium">
                      {feature.name}
                      {feature.category && <span className="text-muted-foreground ml-1">({feature.category})</span>}
                    </td>
                    {pages.map((page: any) => {
                      const mapping = getMappingForCell(feature.id, page.id);
                      return (
                        <td key={page.id} className="p-1 border-b text-center">
                          {mapping ? (
                            <Badge className={`text-[10px] px-1.5 py-0.5 ${DEPTH_COLORS[mapping.mapping.coverageDepth] || "bg-gray-200"}`}>
                              {mapping.mapping.coverageDepth}
                              {mapping.mapping.aiConfidence !== null && (
                                <span className="ml-1 opacity-75">{Math.round(mapping.mapping.aiConfidence * 100)}%</span>
                              )}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>Legend:</span>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" /> Primary</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500" /> Detailed</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-400" /> Mentioned</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-200" /> — No coverage</div>
      </div>
    </div>
  );
}
