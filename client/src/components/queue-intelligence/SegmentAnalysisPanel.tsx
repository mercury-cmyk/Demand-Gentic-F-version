import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import type { SegmentAnalysis } from "./types";
import { TIER_COLORS, SCORE_DIMENSIONS } from "./types";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface Props {
  data: SegmentAnalysis;
}

export function SegmentAnalysisPanel({ data }: Props) {
  const [expandedTier, setExpandedTier] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Tier Overview Cards */}
      <div className="grid grid-cols-4 gap-4">
        {data.tiers.map((tier) => {
          const color = TIER_COLORS[tier.name] || "#6b7280";
          return (
            <Card
              key={tier.name}
              className="cursor-pointer hover:shadow-md transition-shadow"
              style={{ borderTop: `3px solid ${color}` }}
              onClick={() => setExpandedTier(expandedTier === tier.name ? null : tier.name)}
            >
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">{tier.name}</h3>
                  {expandedTier === tier.name ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-1">Range: {tier.range}</p>
                <p className="text-2xl font-bold">{tier.count}</p>
                <p className="text-xs text-muted-foreground">Avg: {tier.avgScore}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Expanded Tier Detail */}
      {expandedTier && (() => {
        const tier = data.tiers.find(t => t.name === expandedTier);
        if (!tier) return null;
        const color = TIER_COLORS[tier.name] || "#6b7280";

        const radarData = SCORE_DIMENSIONS.map(dim => ({
          dimension: dim.label,
          value: tier.avgBreakdown[dim.key] || 0,
          fullMark: 200,
        }));

        return (
          <Card style={{ borderLeft: `4px solid ${color}` }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {tier.name} Detail — {tier.count} contacts (avg {tier.avgScore})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                {/* Radar Chart */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">
                    Avg Sub-Score Profile
                  </h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="dimension" fontSize={10} />
                      <PolarRadiusAxis angle={90} domain={[0, 200]} fontSize={9} />
                      <Radar
                        name="Score"
                        dataKey="value"
                        stroke={color}
                        fill={color}
                        fillOpacity={0.3}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Industry Breakdown */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">
                    Top Industries
                  </h4>
                  <div className="space-y-2">
                    {tier.industryBreakdown.slice(0, 8).map((ind) => (
                      <div key={ind.industry} className="flex items-center justify-between text-sm">
                        <span className="truncate max-w-[140px]">{ind.industry}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {ind.count}
                          </Badge>
                          <span className="text-xs text-muted-foreground w-10 text-right">
                            {ind.avgScore}
                          </span>
                        </div>
                      </div>
                    ))}
                    {tier.industryBreakdown.length === 0 && (
                      <p className="text-xs text-muted-foreground">No data</p>
                    )}
                  </div>
                </div>

                {/* Role Breakdown */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">
                    Top Roles
                  </h4>
                  <div className="space-y-2">
                    {tier.roleBreakdown.slice(0, 8).map((role) => (
                      <div key={role.role} className="flex items-center justify-between text-sm">
                        <span className="truncate max-w-[140px]">{role.role}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {role.count}
                          </Badge>
                          <span className="text-xs text-muted-foreground w-10 text-right">
                            {role.avgScore}
                          </span>
                        </div>
                      </div>
                    ))}
                    {tier.roleBreakdown.length === 0 && (
                      <p className="text-xs text-muted-foreground">No data</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {!expandedTier && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Click a tier card above to see detailed breakdown
        </p>
      )}
    </div>
  );
}
