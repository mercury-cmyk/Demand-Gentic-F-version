import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { ScoreOverview, ScoredContact } from "./types";
import { TIER_COLORS, SCORE_DIMENSIONS } from "./types";
import { Target, Users, TrendingUp, Award } from "lucide-react";

interface Props {
  data: ScoreOverview;
}

function ScoreBar({ breakdown }: { breakdown: ScoredContact["breakdown"] }) {
  return (
    <div className="flex gap-0.5 w-24">
      {SCORE_DIMENSIONS.map(dim => (
        <div
          key={dim.key}
          className="h-3 rounded-sm"
          style={{
            width: `${(breakdown[dim.key] / 200) * 100}%`,
            backgroundColor: dim.color,
            minWidth: "2px",
          }}
          title={`${dim.label}: ${breakdown[dim.key]}/200`}
        />
      ))}
    </div>
  );
}

export function ScoreOverviewPanel({ data }: Props) {
  const tier1Count = data.tierDistribution.find(t => t.tier.includes("800"))?.count || 0;

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              Total Queued
            </div>
            <p className="text-2xl font-bold">{data.totalQueued.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Target className="h-4 w-4" />
              Scored
            </div>
            <p className="text-2xl font-bold">{data.totalScored.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {data.totalQueued > 0 ? Math.round((data.totalScored / data.totalQueued) * 100) : 0}% of queue
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              Avg Score
            </div>
            <p className="text-2xl font-bold">{data.avgScore}</p>
            <p className="text-xs text-muted-foreground">out of 1000</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Award className="h-4 w-4" />
              Tier 1 Contacts
            </div>
            <p className="text-2xl font-bold">{tier1Count}</p>
            <p className="text-xs text-muted-foreground">score 800+</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Score Distribution Histogram */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {data.scoreHistogram.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.scoreHistogram}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="bucket" fontSize={10} angle={-20} textAnchor="end" height={40} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.scoreHistogram.map((entry, idx) => {
                      const bucketStart = parseInt(entry.bucket);
                      let color = "#ef4444";
                      if (bucketStart >= 800) color = "#22c55e";
                      else if (bucketStart >= 600) color = "#3b82f6";
                      else if (bucketStart >= 400) color = "#f59e0b";
                      return <Cell key={idx} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No scores yet</p>
            )}
          </CardContent>
        </Card>

        {/* Tier Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tier Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.tierDistribution.map((tier) => {
                const tierName = tier.tier.split(" ")[0] + " " + tier.tier.split(" ")[1];
                const tierKey = tierName.split(" ")[0] + " " + tierName.split(" ")[1];
                const color = TIER_COLORS[tierKey] || "#6b7280";
                const pct = data.totalScored > 0 ? Math.round((tier.count / data.totalScored) * 100) : 0;

                return (
                  <div key={tier.tier} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        <span className="font-medium">{tier.tier}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {tier.count} contacts ({pct}%)
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <p className="text-xs text-muted-foreground">Avg score: {tier.avgScore}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Priority Contacts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top 10 Priority Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topContacts.length > 0 ? (
            <div className="space-y-2">
              {data.topContacts.map((contact, idx) => (
                <div
                  key={contact.queueId}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-muted-foreground w-6">#{idx + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{contact.contactName}</p>
                      <p className="text-xs text-muted-foreground">
                        {contact.jobTitle || "N/A"} at {contact.accountName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <ScoreBar breakdown={contact.breakdown} />
                    <Badge
                      variant="outline"
                      className={
                        contact.aiPriorityScore >= 800
                          ? "border-green-500 text-green-600"
                          : contact.aiPriorityScore >= 600
                          ? "border-blue-500 text-blue-600"
                          : contact.aiPriorityScore >= 400
                          ? "border-yellow-500 text-yellow-600"
                          : "border-red-500 text-red-600"
                      }
                    >
                      {contact.aiPriorityScore}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No scored contacts</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
