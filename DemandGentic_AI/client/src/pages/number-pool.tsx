/**
 * Number Pool Management Page
 *
 * Manage Telnyx phone numbers for AI calling:
 * - View all numbers and their status
 * - Sync from Telnyx
 * - View reputation scores
 * - Manage cooldowns
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Phone,
  RefreshCw,
  Search,
  MoreVertical,
  Pause,
  Play,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  Loader2,
  TrendingUp,
  Activity,
  PhoneCall,
  BarChart3,
} from "lucide-react";

interface TelnyxNumber {
  id: string;
  phoneNumberE164: string;
  displayName: string | null;
  status: 'active' | 'cooling' | 'suspended' | 'retired';
  region: string | null;
  areaCode: string | null;
  reputationScore: number | null;
  reputationBand: string | null;
  callsToday: number;
  callsThisHour: number;
  maxCallsPerHour: number;
  maxCallsPerDay: number;
  lastUsedAt: string | null;
  createdAt: string;
}

interface PoolSummary {
  totalNumbers: number;
  activeNumbers: number;
  pausedNumbers: number;
  cooldownNumbers: number;
  retiredNumbers: number;
  healthyNumbers: number;
  warningNumbers: number;
  riskNumbers: number;
  burnedNumbers: number;
  unassignedNumbers: number;
}

interface CallStats {
  totalCallsToday: number;
  totalCallsThisHour: number;
  activeNumbersUsedToday: number;
  avgCallsPerNumber: number;
  topNumbers: Array;
}

export default function NumberPoolPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingNumber, setEditingNumber] = useState(null);
  const [editLimits, setEditLimits] = useState({ hourly: 40, daily: 500 });

  // Update limits mutation
  const updateLimitsMutation = useMutation({
    mutationFn: async (data: { id: string; hourly: number; daily: number }) => {
      const res = await apiRequest("PATCH", `/api/number-pool/numbers/${data.id}`, {
        maxCallsPerHour: data.hourly,
        maxCallsPerDay: data.daily,
      });
      if (!res.ok) throw new Error("Failed to update limits");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/number-pool/numbers"] });
      toast({ title: "Limits updated successfully" });
      setEditingNumber(null);
    },
    onError: (err) => {
      toast({
        title: "Failed to update limits",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Fetch numbers
  const { data: numbersData, isLoading: numbersLoading } = useQuery({
    queryKey: ["/api/number-pool/numbers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/number-pool/numbers");
      if (!res.ok) throw new Error("Failed to fetch numbers");
      return res.json();
    },
  });

  // Fetch pool summary
  const { data: summaryData } = useQuery({
    queryKey: ["/api/number-pool/summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/number-pool/summary");
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
  });

  // Fetch call stats
  const { data: statsData } = useQuery({
    queryKey: ["/api/number-pool/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/number-pool/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchIntervalInBackground: false,
  });

  // Sync from Telnyx mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/number-pool/sync");
      if (!res.ok) throw new Error("Failed to sync");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/number-pool/numbers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/number-pool/summary"] });
      toast({
        title: "Sync Complete",
        description: `Added: ${data.data?.added || 0}, Updated: ${data.data?.updated || 0}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update number status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/number-pool/numbers/${id}`, { status });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/number-pool/numbers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/number-pool/summary"] });
      toast({ title: "Status Updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const numbers: TelnyxNumber[] = numbersData?.data || [];
  const summary: PoolSummary = summaryData?.data || {
    totalNumbers: 0,
    activeNumbers: 0,
    pausedNumbers: 0,
    cooldownNumbers: 0,
    retiredNumbers: 0,
    healthyNumbers: 0,
    warningNumbers: 0,
    riskNumbers: 0,
    burnedNumbers: 0,
    unassignedNumbers: 0,
  };
  const callStats: CallStats = statsData?.data || {
    totalCallsToday: 0,
    totalCallsThisHour: 0,
    activeNumbersUsedToday: 0,
    avgCallsPerNumber: 0,
    topNumbers: [],
  };

  // Filter numbers by search
  const filteredNumbers = numbers.filter((num) =>
    num.phoneNumberE164.includes(searchQuery) ||
    num.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    num.region?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return Active;
      case "cooling":
        return Cooling;
      case "suspended":
        return Suspended;
      case "retired":
        return Retired;
      default:
        return {status};
    }
  };

  const getReputationBadge = (band: string | null, score: number | null) => {
    if (!band) return -;

    const colors: Record = {
      healthy: "bg-green-500/10 text-green-600",
      warning: "bg-amber-500/10 text-amber-600",
      risk: "bg-orange-500/10 text-orange-600",
      burned: "bg-red-500/10 text-red-600",
    };

    return (
      
        {band} {score !== null && `(${score})`}
      
    );
  };

  return (
    
      {/* Header */}
      
        
          
            
            Number Pool
          
          
            Manage your Telnyx phone numbers for AI calling
          
        
         syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? (
            
          ) : (
            
          )}
          Sync from Telnyx
        
      

      {/* Summary Cards */}
      
        
          
            
              
                Total
                {summary.totalNumbers}
              
              
            
          
        

        
          
            
              
                Active
                {summary.activeNumbers}
              
              
            
          
        

        
          
            
              
                Cooling
                {summary.cooldownNumbers}
              
              
            
          
        

        
          
            
              
                Healthy
                {summary.healthyNumbers}
              
              
            
          
        

        
          
            
              
                At Risk
                {summary.riskNumbers}
              
              
            
          
        

        
          
            
              
                Burned
                {summary.burnedNumbers}
              
              
            
          
        
      

      {/* Call Activity Stats */}
      
        
          
            
            Call Activity
          
          
            Real-time call statistics across all numbers
          
        
        
          
            
              
                
                Calls This Hour
              
              {callStats.totalCallsThisHour}
            
            
              
                
                Calls Today
              
              {callStats.totalCallsToday}
            
            
              
                
                Numbers Used Today
              
              {callStats.activeNumbersUsedToday}
            
            
              
                
                Avg Calls/Number
              
              {callStats.avgCallsPerNumber}
            
          

          {/* Top Numbers by Calls */}
          {callStats.topNumbers.length > 0 && (
            
              Top Numbers by Usage Today
              
                {callStats.topNumbers.slice(0, 5).map((num, index) => (
                  
                    
                      
                        #{index + 1}
                      
                      {num.phoneNumberE164}
                    
                    
                      
                        {num.callsThisHour}/hr
                      
                      
                        {num.callsToday} today
                      
                    
                  
                ))}
              
            
          )}
        
      

      {/* Numbers Table */}
      
        
          
            
              Phone Numbers
              
                {filteredNumbers.length} of {numbers.length} numbers
              
            
            
              
               setSearchQuery(e.target.value)}
                className="pl-9"
              />
            
          
        
        
          {numbersLoading ? (
            
              
            
          ) : filteredNumbers.length === 0 ? (
            
              
              No numbers found
              Click "Sync from Telnyx" to import your numbers
            
          ) : (
            
              
                
                  Phone Number
                  Status
                  Reputation
                  Limit (Hr)
                  Limit (Day)
                  Calls Today
                  Last Used
                  Region
                  
                
              
              
                {filteredNumbers.map((num) => (
                  
                    
                      {num.phoneNumberE164}
                      {num.displayName && (
                        
                          ({num.displayName})
                        
                      )}
                    
                    {getStatusBadge(num.status)}
                    
                      {getReputationBadge(num.reputationBand, num.reputationScore)}
                    
                    {num.maxCallsPerHour}
                    {num.maxCallsPerDay}
                    
                      
                        
                        {num.callsToday}
                        
                          ({num.callsThisHour}/hr)
                        
                      
                    
                    
                      {num.lastUsedAt
                        ? new Date(num.lastUsedAt).toLocaleDateString()
                        : "Never"}
                    
                    {num.region || num.areaCode || "-"}
                    
                      
                        
                          
                            
                          
                        
                        
                           {
                              setEditingNumber(num);
                              setEditLimits({
                                hourly: num.maxCallsPerHour || 40,
                                daily: num.maxCallsPerDay || 500
                              });
                            }}
                          >
                            
                            Edit Limits
                          
                          {num.status === "active" ? (
                            
                                updateStatusMutation.mutate({
                                  id: num.id,
                                  status: "suspended",
                                })
                              }
                            >
                              
                              Suspend
                            
                          ) : (
                            
                                updateStatusMutation.mutate({
                                  id: num.id,
                                  status: "active",
                                })
                              }
                            >
                              
                              Activate
                            
                          )}
                          
                          
                              updateStatusMutation.mutate({
                                id: num.id,
                                status: "retired",
                              })
                            }
                          >
                            
                            Retire
                          
                        
                      
                    
                  
                ))}
              
            
          )}
        
      

       !open && setEditingNumber(null)}>
        
          
            Edit Call Limits
            
              Adjust spacing limits for {editingNumber?.phoneNumberE164}
            
          
          
            
              
                Hourly Limit
              
               setEditLimits({ ...editLimits, hourly: parseInt(e.target.value) || 0 })}
                className="col-span-3"
              />
            
            
              
                Daily Limit
              
               setEditLimits({ ...editLimits, daily: parseInt(e.target.value) || 0 })}
                className="col-span-3"
              />
            
          
          
             {
                if (editingNumber) {
                  updateLimitsMutation.mutate({
                    id: editingNumber.id,
                    hourly: editLimits.hourly,
                    daily: editLimits.daily
                  });
                }
              }}
              disabled={updateLimitsMutation.isPending}
            >
              {updateLimitsMutation.isPending && }
              Save Changes
            
          
        
      
    
  );
}