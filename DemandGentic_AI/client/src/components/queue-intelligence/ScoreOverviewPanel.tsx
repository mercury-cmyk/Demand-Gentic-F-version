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
    
      {SCORE_DIMENSIONS.map(dim => (
        
      ))}
    
  );
}

export function ScoreOverviewPanel({ data }: Props) {
  const tier1Count = data.tierDistribution.find(t => t.tier.includes("800"))?.count || 0;

  return (
    
      {/* Metric Cards */}
      
        
          
            
              
              Total Queued
            
            {data.totalQueued.toLocaleString()}
          
        
        
          
            
              
              Scored
            
            {data.totalScored.toLocaleString()}
            
              {data.totalQueued > 0 ? Math.round((data.totalScored / data.totalQueued) * 100) : 0}% of queue
            
          
        
        
          
            
              
              Avg Score
            
            {data.avgScore}
            out of 1000
          
        
        
          
            
              
              Tier 1 Contacts
            
            {tier1Count}
            score 800+
          
        
      

      
        {/* Score Distribution Histogram */}
        
          
            Score Distribution
          
          
            {data.scoreHistogram.length > 0 ? (
              
                
                  
                  
                  
                  
                  
                    {data.scoreHistogram.map((entry, idx) => {
                      const bucketStart = parseInt(entry.bucket);
                      let color = "#ef4444";
                      if (bucketStart >= 800) color = "#22c55e";
                      else if (bucketStart >= 600) color = "#3b82f6";
                      else if (bucketStart >= 400) color = "#f59e0b";
                      return ;
                    })}
                  
                
              
            ) : (
              No scores yet
            )}
          
        

        {/* Tier Breakdown */}
        
          
            Tier Breakdown
          
          
            
              {data.tierDistribution.map((tier) => {
                const tierName = tier.tier.split(" ")[0] + " " + tier.tier.split(" ")[1];
                const tierKey = tierName.split(" ")[0] + " " + tierName.split(" ")[1];
                const color = TIER_COLORS[tierKey] || "#6b7280";
                const pct = data.totalScored > 0 ? Math.round((tier.count / data.totalScored) * 100) : 0;

                return (
                  
                    
                      
                        
                        {tier.tier}
                      
                      
                        {tier.count} contacts ({pct}%)
                      
                    
                    
                    Avg score: {tier.avgScore}
                  
                );
              })}
            
          
        
      

      {/* Top Priority Contacts */}
      
        
          Top 10 Priority Contacts
        
        
          {data.topContacts.length > 0 ? (
            
              {data.topContacts.map((contact, idx) => (
                
                  
                    #{idx + 1}
                    
                      {contact.contactName}
                      
                        {contact.jobTitle || "N/A"} at {contact.accountName}
                      
                    
                  
                  
                    
                    = 800
                          ? "border-green-500 text-green-600"
                          : contact.aiPriorityScore >= 600
                          ? "border-blue-500 text-blue-600"
                          : contact.aiPriorityScore >= 400
                          ? "border-yellow-500 text-yellow-600"
                          : "border-red-500 text-red-600"
                      }
                    >
                      {contact.aiPriorityScore}
                    
                  
                
              ))}
            
          ) : (
            No scored contacts
          )}
        
      
    
  );
}