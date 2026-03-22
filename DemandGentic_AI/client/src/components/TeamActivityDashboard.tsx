import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  format,
  formatDistanceToNow,
  subDays,
  startOfDay,
  endOfDay,
} from "date-fns";
import { Activity, Clock, MessageSquare, TrendingUp, Users, Eye } from "lucide-react";

interface TeamMember {
  userId: string;
  username: string;
  status: "online" | "offline" | "away" | "busy" | "do_not_disturb";
  lastSeenAt: Date;
}

interface ActivityRecord {
  id: string;
  userId: string;
  module: string;
  activityType: string;
  description: string;
  createdAt: Date;
}

interface TimeTrackingData {
  module: string;
  totalSeconds: number;
  sessionCount: number;
}

interface CrmInteraction {
  id: string;
  userId: string;
  interactionType: string;
  entityType: string;
  entityName: string;
  outcome?: string;
  createdAt: Date;
}

const COLORS_MODULES = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];
const COLORS_STATUS = {
  online: "#10b981",
  offline: "#6b7280",
  away: "#f59e0b",
  busy: "#ef4444",
  do_not_disturb: "#8b5cf6",
};

export const TeamActivityDashboard: React.FC = ({
  teamId,
}) => {
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [timeTracking, setTimeTracking] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [dashboard, setDashboard] = useState(null);

  const [filters, setFilters] = useState({
    days: 7,
    userId: "",
    module: "",
    sortBy: "recent",
  });

  const [activeTab, setActiveTab] = useState("overview");

  // Fetch team status
  const fetchTeamStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/team-activity/team/${teamId}/status`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setTeamMembers(data.statuses);
      }
    } catch (error) {
      console.error("Error fetching team status:", error);
    }
  }, [teamId]);

  // Fetch activity log
  const fetchActivities = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        days: filters.days.toString(),
        limit: "100",
      });
      if (filters.userId) params.append("userId", filters.userId);
      if (filters.module) params.append("module", filters.module);

      const res = await fetch(
        `/api/team-activity/log/${teamId}?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities);
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
    }
  }, [teamId, filters]);

  // Fetch time tracking
  const fetchTimeTracking = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        days: filters.days.toString(),
      });
      if (filters.userId) params.append("userId", filters.userId);

      const res = await fetch(
        `/api/team-activity/time-tracking/${teamId}?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setTimeTracking(
          data.timeTracking.map((item: any) => ({
            module: item.module,
            totalSeconds: item.totalSeconds || 0,
            sessionCount: item.sessionCount || 0,
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching time tracking:", error);
    }
  }, [teamId, filters]);

  // Fetch CRM interactions
  const fetchCrmInteractions = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        days: filters.days.toString(),
        limit: "100",
      });

      const res = await fetch(
        `/api/team-activity/crm-interaction/${teamId}?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setInteractions(data.interactions);
      }
    } catch (error) {
      console.error("Error fetching CRM interactions:", error);
    }
  }, [teamId, filters]);

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        days: filters.days.toString(),
      });

      const res = await fetch(
        `/api/team-activity/dashboard/${teamId}?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setDashboard(data.dashboard);
      }
    } catch (error) {
      console.error("Error fetching dashboard:", error);
    } finally {
      setLoading(false);
    }
  }, [teamId, filters.days]);

  useEffect(() => {
    fetchTeamStatus();
    const interval = setInterval(fetchTeamStatus, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [fetchTeamStatus]);

  useEffect(() => {
    fetchDashboard();
    fetchActivities();
    fetchTimeTracking();
    fetchCrmInteractions();
  }, [
    fetchDashboard,
    fetchActivities,
    fetchTimeTracking,
    fetchCrmInteractions,
  ]);

  const getStatusBadge = (status: string) => {
    const colors = {
      online: "bg-green-100 text-green-800",
      offline: "bg-gray-100 text-gray-800",
      away: "bg-yellow-100 text-yellow-800",
      busy: "bg-red-100 text-red-800",
      do_not_disturb: "bg-purple-100 text-purple-800",
    };
    return colors[status as keyof typeof colors] || colors.offline;
  };

  const formatSeconds = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const moduleChartData = timeTracking.map((item) => ({
    module: item.module,
    hours: Math.round((item.totalSeconds / 3600) * 10) / 10,
  }));

  const interactionTypeData = interactions.reduce(
    (acc, item) => {
      const existing = acc.find((x) => x.type === item.interactionType);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ type: item.interactionType, count: 1 });
      }
      return acc;
    },
    [] as Array
  );

  const onlineCount = teamMembers.filter((m) => m.status === "online").length;
  const activityCount = activities.length;
  const crmInteractionCount = interactions.length;

  return (
    
      {/* Header */}
      
        
          Team Activity
          
            Monitor your team's activity, time tracking, and CRM interactions
          
        
        
          
            
              
            
            
              Last 24 hours
              Last 7 days
              Last 30 days
              Last 90 days
            
          
        
      

      {/* KPI Cards */}
      
        
          
            
              Online Members
            
          
          
            {onlineCount}
            
              of {teamMembers.length} total
            
          
        

        
          
            
              
              Activities
            
          
          
            {activityCount}
            
              in last {filters.days} days
            
          
        

        
          
            
              
              Top Module
            
          
          
            
              {timeTracking.length > 0
                ? formatSeconds(
                    Math.max(...timeTracking.map((t) => t.totalSeconds))
                  )
                : "0m"}
            
            
              {timeTracking.reduce((a, b) =>
                a.totalSeconds > b.totalSeconds ? a : b
              )?.module || "N/A"}
            
          
        

        
          
            
              
              CRM Interactions
            
          
          
            {crmInteractionCount}
            
              total recorded
            
          
        
      

      {/* Tabs */}
      
        {(
          ["overview", "activities", "time", "crm", "communication"] as const
        ).map((tab) => (
           setActiveTab(tab)}
            className={`px-4 py-2 font-medium text-sm border-b-2 ${
              activeTab === tab
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          
        ))}
      

      {/* Tab Content */}
      {activeTab === "overview" && (
        
          {/* Team Members Status */}
          
            
              Team Members
              Current online status
            
            
              
                {teamMembers.map((member) => (
                  
                    
                      
                      
                        {member.username}
                        
                          {formatDistanceToNow(new Date(member.lastSeenAt), {
                            addSuffix: true,
                          })}
                        
                      
                    
                    {member.status}
                  
                ))}
              
            
          

          {/* Time Spent by Module */}
          
            
              Time by Module
              Hours spent in each module
            
            
              {moduleChartData.length > 0 ? (
                
                  
                    
                      {moduleChartData.map((_, index) => (
                        
                      ))}
                    
                    
                  
                
              ) : (
                
                  No time tracking data available
                
              )}
            
          
        
      )}

      {activeTab === "activities" && (
        
          
            Activity Log
            Recent team member activities
          
          
            
              
                
                  
                    User
                    Module
                    Type
                    Description
                    Time
                  
                
                
                  {activities.map((activity) => (
                    
                      
                        {activity.userId}
                      
                      
                        {activity.module}
                      
                      
                        {activity.activityType}
                      
                      {activity.description}
                      
                        {formatDistanceToNow(new Date(activity.createdAt), {
                          addSuffix: true,
                        })}
                      
                    
                  ))}
                
              
            
          
        
      )}

      {activeTab === "time" && (
        
          
            Module Time Tracking
            Time spent on each module
          
          
            {moduleChartData.length > 0 ? (
              
                
                  
                  
                  
                  
                  
                
              
            ) : (
              
                No time tracking data available
              
            )}

            
              {timeTracking.map((item) => (
                
                  
                    {item.module}
                    
                      {formatSeconds(item.totalSeconds)}
                    
                    
                      {item.sessionCount} sessions
                    
                  
                
              ))}
            
          
        
      )}

      {activeTab === "crm" && (
        
          
            CRM Interactions
            Contact, account, and email interactions
          
          
            
              {interactionTypeData.length > 0 && (
                
                  Interaction Types
                  
                    
                      
                      
                      
                      
                      
                    
                  
                
              )}

              
                Recent Interactions
                
                  
                    
                      
                        Type
                        Entity
                        Name
                        Outcome
                        Time
                      
                    
                    
                      {interactions.slice(0, 20).map((interaction) => (
                        
                          
                            
                              {interaction.interactionType}
                            
                          
                          {interaction.entityType}
                          {interaction.entityName}
                          
                            {interaction.outcome && (
                              
                                {interaction.outcome}
                              
                            )}
                          
                          
                            {formatDistanceToNow(
                              new Date(interaction.createdAt),
                              { addSuffix: true }
                            )}
                          
                        
                      ))}
                    
                  
                
              
            
          
        
      )}

      {activeTab === "communication" && (
        
          
            Team Communication
            Internal team messages and discussions
          
          
            
              
              Communication log feature coming soon
            
          
        
      )}
    
  );
};

export default TeamActivityDashboard;