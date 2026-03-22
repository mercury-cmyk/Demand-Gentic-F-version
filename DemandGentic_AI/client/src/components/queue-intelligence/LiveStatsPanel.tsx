import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Globe,
  Phone,
  PhoneOff,
  ShieldCheck,
  Users,
  Clock,
  ArrowUp,
  Zap,
  MapPin,
  TrendingUp,
} from "lucide-react";

/* ── Types ── */
export interface LiveStatsData {
  campaignId: string;
  generatedAt: string;
  queueStatus: {
    total: number;
    queued: number;
    inProgress: number;
    done: number;
    removed: number;
  };
  countryDistribution: Array;
  phoneStatus: {
    totalQueued: number;
    hasPhone: number;
    missingPhone: number;
    e164Normalized: number;
    verified: number;
    phoneRate: number;
  };
  priorityTiers: Array;
  nextInLine: Array;
  timezoneAnalysis: {
    totalCallableNow: number;
    totalSleeping: number;
    totalUnknownTimezone: number;
    groups: Array;
  };
}

/* ── Priority tier colors ── */
const TIER_STYLE: Record = {
  "Top Priority (400+)": { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500" },
  "High (200-399)": { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", bar: "bg-blue-500" },
  "Medium (100-199)": { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500" },
  "Low (50-99)": { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", bar: "bg-orange-500" },
  "Minimal (0-49)": { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-400", bar: "bg-slate-400" },
};

function getTierStyle(tier: string) {
  return TIER_STYLE[tier] || TIER_STYLE["Minimal (0-49)"];
}

interface LiveStatsPanelProps {
  data: LiveStatsData;
}

export function LiveStatsPanel({ data }: LiveStatsPanelProps) {
  const { queueStatus, countryDistribution, phoneStatus, priorityTiers, nextInLine, timezoneAnalysis } = data;
  const totalPriorityContacts = priorityTiers.reduce((sum, t) => sum + t.count, 0);

  return (
    
      {/* Row 1: KPI Cards */}
      
        
          
            
              
              Total Queued
            
            {queueStatus.queued.toLocaleString()}
            
              {queueStatus.inProgress} in progress / {queueStatus.done} done
            
          
        

        
          
            
              
              Phone Coverage
            
            {phoneStatus.phoneRate}%
            
              {phoneStatus.hasPhone.toLocaleString()} have phone / {phoneStatus.missingPhone.toLocaleString()} missing
            
          
        

        
          
            
              
              Callable Now
            
            {timezoneAnalysis.totalCallableNow.toLocaleString()}
            
              {timezoneAnalysis.totalSleeping} sleeping / {timezoneAnalysis.totalUnknownTimezone} unknown TZ
            
          
        

        
          
            
              
              Countries
            
            {countryDistribution.length}
            
              {timezoneAnalysis.groups.length} timezone{timezoneAnalysis.groups.length !== 1 ? "s" : ""} detected
            
          
        
      

      {/* Row 2: Country Distribution + Phone Status */}
      
        {/* Country Distribution */}
        
          
            
              
              Country Distribution
            
          
          
            {countryDistribution.length === 0 ? (
              No queued contacts
            ) : (
              countryDistribution.map((row) => {
                const pct = queueStatus.queued > 0 ? Math.round((row.queued / queueStatus.queued) * 100) : 0;
                return (
                  
                    
                      {row.country}
                    
                    
                      
                        
                      
                    
                    
                      
                        {row.queued.toLocaleString()}
                      
                      
                        {pct}%
                      
                    
                  
                );
              })
            )}
          
        

        {/* Phone Status Breakdown */}
        
          
            
              
              Phone Number Status
            
          
          
            {/* Phone rate bar */}
            
              
                Phone coverage
                {phoneStatus.phoneRate}%
              
              
            

            {/* Breakdown rows */}
            
              
                
                  
                  Has Phone Number
                
                {phoneStatus.hasPhone.toLocaleString()}
              
              
                
                  
                  Missing Phone
                
                {phoneStatus.missingPhone.toLocaleString()}
              
              
                
                  
                  E.164 Normalized
                
                {phoneStatus.e164Normalized.toLocaleString()}
              
              
                
                  
                  Verified
                
                {phoneStatus.verified.toLocaleString()}
              
            

            {/* Timezone callable breakdown */}
            
              
                
                Business Hours Status
              
              
                
                  
                    {timezoneAnalysis.totalCallableNow}
                  
                  Callable
                
                
                  
                    {timezoneAnalysis.totalSleeping}
                  
                  Sleeping
                
                
                  
                    {timezoneAnalysis.totalUnknownTimezone}
                  
                  Unknown
                
              
            
          
        
      

      {/* Row 3: Priority Tiers + Next In Line */}
      
        {/* Priority Tier Distribution */}
        
          
            
              
              Priority Distribution
              
                {totalPriorityContacts.toLocaleString()} queued
              
            
          
          
            {priorityTiers.length === 0 ? (
              No priority data available
            ) : (
              priorityTiers.map((tier) => {
                const style = getTierStyle(tier.tier);
                const pct = totalPriorityContacts > 0 ? Math.round((tier.count / totalPriorityContacts) * 100) : 0;
                return (
                  
                    
                      {tier.tier}
                      
                        
                          {tier.count.toLocaleString()}
                        
                        {pct}%
                      
                    
                    
                      
                    
                    
                      Avg priority: {tier.avgPriority} (range: {tier.minPriority}–{tier.maxPriority})
                    
                  
                );
              })
            )}
          
        

        {/* Next In Line */}
        
          
            
              
              Next In Line
              
                (top {nextInLine.length} by priority)
              
            
          
          
            {nextInLine.length === 0 ? (
              No contacts ready to dial
            ) : (
              
                {nextInLine.map((contact, idx) => (
                  
                    {/* Rank */}
                    
                      {idx + 1}
                    

                    {/* Contact info */}
                    
                      {contact.contactName}
                      
                        {[contact.jobTitle, contact.accountName].filter(Boolean).join(" @ ")}
                      
                    

                    {/* Country */}
                    {contact.country && (
                      
                        {contact.country}
                      
                    )}

                    {/* Phone indicator */}
                    {contact.bestPhone ? (
                      
                        {contact.bestPhone}
                      
                    ) : (
                      
                    )}

                    {/* Priority */}
                    = 400 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" :
                        contact.priority >= 200 ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" :
                        contact.priority >= 100 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" :
                        ""
                      }`}
                    >
                      P{contact.priority}
                    
                  
                ))}
              
            )}
          
        
      

      {/* Row 4: Timezone Groups */}
      {timezoneAnalysis.groups.length > 0 && (
        
          
            
              
              Active Timezones
              
                {timezoneAnalysis.groups.length} zone{timezoneAnalysis.groups.length !== 1 ? "s" : ""}
              
            
          
          
            
              {timezoneAnalysis.groups.map((group) => (
                
                  
                  
                    
                      {group.timezone === "Unknown" ? "Unknown" : group.timezone.replace(/_/g, " ")}
                    
                    {group.country && (
                      {group.country}
                    )}
                  
                  
                    {group.contactCount.toLocaleString()}
                  
                  {group.opensAt && !group.isCurrentlyOpen && (
                    
                      {new Date(group.opensAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    
                  )}
                
              ))}
            
          
        
      )}

      {/* Footer: Generated timestamp */}
      
        Stats generated at {new Date(data.generatedAt).toLocaleString()} — refreshes when tab is viewed
      
    
  );
}