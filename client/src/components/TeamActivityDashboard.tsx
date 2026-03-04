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

export const TeamActivityDashboard: React.FC<{ teamId: string }> = ({
  teamId,
}) => {
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [timeTracking, setTimeTracking] = useState<TimeTrackingData[]>([]);
  const [interactions, setInteractions] = useState<CrmInteraction[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);

  const [filters, setFilters] = useState({
    days: 7,
    userId: "",
    module: "",
    sortBy: "recent",
  });

  const [activeTab, setActiveTab] = useState<
    "overview" | "activities" | "time" | "crm" | "communication"
  >("overview");

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
    [] as Array<{ type: string; count: number }>
  );

  const onlineCount = teamMembers.filter((m) => m.status === "online").length;
  const activityCount = activities.length;
  const crmInteractionCount = interactions.length;

  return (
    <div className="w-full space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Activity</h1>
          <p className="text-muted-foreground mt-1">
            Monitor your team's activity, time tracking, and CRM interactions
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={filters.days.toString()}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Online Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{onlineCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              of {teamMembers.length} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <Activity className="w-4 h-4 inline mr-1" />
              Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activityCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              in last {filters.days} days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <Clock className="w-4 h-4 inline mr-1" />
              Top Module
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {timeTracking.length > 0
                ? formatSeconds(
                    Math.max(...timeTracking.map((t) => t.totalSeconds))
                  )
                : "0m"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {timeTracking.reduce((a, b) =>
                a.totalSeconds > b.totalSeconds ? a : b
              )?.module || "N/A"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <MessageSquare className="w-4 h-4 inline mr-1" />
              CRM Interactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{crmInteractionCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              total recorded
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(
          ["overview", "activities", "time", "crm", "communication"] as const
        ).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium text-sm border-b-2 ${
              activeTab === tab
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-2 gap-6">
          {/* Team Members Status */}
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Current online status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {teamMembers.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor:
                            COLORS_STATUS[
                              member.status as keyof typeof COLORS_STATUS
                            ],
                        }}
                      ></div>
                      <div>
                        <p className="font-medium text-sm">{member.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(member.lastSeenAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">{member.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Time Spent by Module */}
          <Card>
            <CardHeader>
              <CardTitle>Time by Module</CardTitle>
              <CardDescription>Hours spent in each module</CardDescription>
            </CardHeader>
            <CardContent>
              {moduleChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={moduleChartData}
                      dataKey="hours"
                      nameKey="module"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    >
                      {moduleChartData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS_MODULES[index % COLORS_MODULES.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  No time tracking data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "activities" && (
        <Card>
          <CardHeader>
            <CardTitle>Activity Log</CardTitle>
            <CardDescription>Recent team member activities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-medium">
                        {activity.userId}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{activity.module}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge>{activity.activityType}</Badge>
                      </TableCell>
                      <TableCell>{activity.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.createdAt), {
                          addSuffix: true,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "time" && (
        <Card>
          <CardHeader>
            <CardTitle>Module Time Tracking</CardTitle>
            <CardDescription>Time spent on each module</CardDescription>
          </CardHeader>
          <CardContent>
            {moduleChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={moduleChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="module" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="hours" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No time tracking data available
              </div>
            )}

            <div className="mt-6 grid grid-cols-3 gap-4">
              {timeTracking.map((item) => (
                <Card key={item.module}>
                  <CardContent className="pt-6">
                    <p className="font-medium">{item.module}</p>
                    <p className="text-2xl font-bold mt-2">
                      {formatSeconds(item.totalSeconds)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.sessionCount} sessions
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "crm" && (
        <Card>
          <CardHeader>
            <CardTitle>CRM Interactions</CardTitle>
            <CardDescription>Contact, account, and email interactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {interactionTypeData.length > 0 && (
                <div>
                  <h3 className="font-medium mb-4">Interaction Types</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={interactionTypeData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="type" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div>
                <h3 className="font-medium mb-4">Recent Interactions</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {interactions.slice(0, 20).map((interaction) => (
                        <TableRow key={interaction.id}>
                          <TableCell>
                            <Badge variant="outline">
                              {interaction.interactionType}
                            </Badge>
                          </TableCell>
                          <TableCell>{interaction.entityType}</TableCell>
                          <TableCell>{interaction.entityName}</TableCell>
                          <TableCell>
                            {interaction.outcome && (
                              <Badge
                                variant={
                                  interaction.outcome === "success"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {interaction.outcome}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDistanceToNow(
                              new Date(interaction.createdAt),
                              { addSuffix: true }
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "communication" && (
        <Card>
          <CardHeader>
            <CardTitle>Team Communication</CardTitle>
            <CardDescription>Internal team messages and discussions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Communication log feature coming soon</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TeamActivityDashboard;
