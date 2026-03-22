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

const DEPTH_COLORS: Record = {
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
      
         Loading coverage data...
      
    );
  }

  if (features.length === 0 && pages.length === 0) {
    return (
      
        
          
          No features or pages to display.
          Add features in the Feature Registry and publish pages to see coverage.
        
      
    );
  }

  return (
    
      {/* Summary Stats */}
      
        
          
            {healthData?.totalFeatures || 0}
            Active Features
          
        
        
          
            {healthData?.totalPages || 0}
            Published Pages
          
        
        
          
            {healthData?.totalMappings || 0}
            Feature-Page Links
          
        
        
          
            {uncoveredFeatures.length}
            Uncovered Features
          
        
      

      {/* Uncovered Features Alert */}
      {uncoveredFeatures.length > 0 && (
        
          
            
              
              Coverage Gaps — Features with No Page
            
          
          
            
              {uncoveredFeatures.map((f: any) => (
                
                  {f.name} {f.category && ({f.category})}
                
              ))}
            
          
        
      )}

      {/* Coverage Matrix */}
      {features.length > 0 && pages.length > 0 && (
        
          
            Coverage Matrix
            Features (rows) vs. Published Pages (columns). Color indicates coverage depth.
          
          
            
              
                
                  Feature
                  {pages.map((page: any) => (
                    
                      {page.title}
                    
                  ))}
                
              
              
                {features.map((feature: any) => (
                  
                    
                      {feature.name}
                      {feature.category && ({feature.category})}
                    
                    {pages.map((page: any) => {
                      const mapping = getMappingForCell(feature.id, page.id);
                      return (
                        
                          {mapping ? (
                            
                              {mapping.mapping.coverageDepth}
                              {mapping.mapping.aiConfidence !== null && (
                                {Math.round(mapping.mapping.aiConfidence * 100)}%
                              )}
                            
                          ) : (
                            —
                          )}
                        
                      );
                    })}
                  
                ))}
              
            
          
        
      )}

      {/* Legend */}
      
        Legend:
         Primary
         Detailed
         Mentioned
         — No coverage
      
    
  );
}