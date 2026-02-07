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

export default function NumberPoolPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

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

  // Sync from Telnyx mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/number-pool/sync");
      if (!res.ok) throw new Error("Failed to sync");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/number-pool"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/number-pool"] });
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

  // Filter numbers by search
  const filteredNumbers = numbers.filter((num) =>
    num.phoneNumberE164.includes(searchQuery) ||
    num.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    num.region?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-600 border-green-200">Active</Badge>;
      case "cooling":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">Cooling</Badge>;
      case "suspended":
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">Suspended</Badge>;
      case "retired":
        return <Badge className="bg-gray-500/10 text-gray-600 border-gray-200">Retired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getReputationBadge = (band: string | null, score: number | null) => {
    if (!band) return <span className="text-muted-foreground">-</span>;

    const colors: Record<string, string> = {
      healthy: "bg-green-500/10 text-green-600",
      warning: "bg-amber-500/10 text-amber-600",
      risk: "bg-orange-500/10 text-orange-600",
      burned: "bg-red-500/10 text-red-600",
    };

    return (
      <Badge className={colors[band] || "bg-gray-500/10 text-gray-600"}>
        {band} {score !== null && `(${score})`}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Phone className="h-8 w-8" />
            Number Pool
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your Telnyx phone numbers for AI calling
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sync from Telnyx
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{summary.totalNumbers}</p>
              </div>
              <Phone className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-600">{summary.activeNumbers}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cooling</p>
                <p className="text-2xl font-bold text-blue-600">{summary.cooldownNumbers}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Healthy</p>
                <p className="text-2xl font-bold text-green-600">{summary.healthyNumbers}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">At Risk</p>
                <p className="text-2xl font-bold text-orange-600">{summary.riskNumbers}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Burned</p>
                <p className="text-2xl font-bold text-red-600">{summary.burnedNumbers}</p>
              </div>
              <Ban className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Numbers Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Phone Numbers</CardTitle>
              <CardDescription>
                {filteredNumbers.length} of {numbers.length} numbers
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search numbers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {numbersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredNumbers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No numbers found</p>
              <p className="text-sm">Click "Sync from Telnyx" to import your numbers</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reputation</TableHead>
                  <TableHead>Calls Today</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNumbers.map((num) => (
                  <TableRow key={num.id}>
                    <TableCell className="font-mono font-medium">
                      {num.phoneNumberE164}
                      {num.displayName && (
                        <span className="text-muted-foreground ml-2 text-sm">
                          ({num.displayName})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(num.status)}</TableCell>
                    <TableCell>
                      {getReputationBadge(num.reputationBand, num.reputationScore)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        {num.callsToday}
                        <span className="text-muted-foreground text-xs">
                          ({num.callsThisHour}/hr)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {num.lastUsedAt
                        ? new Date(num.lastUsedAt).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell>{num.region || num.areaCode || "-"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {num.status === "active" ? (
                            <DropdownMenuItem
                              onClick={() =>
                                updateStatusMutation.mutate({
                                  id: num.id,
                                  status: "suspended",
                                })
                              }
                            >
                              <Pause className="mr-2 h-4 w-4" />
                              Suspend
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() =>
                                updateStatusMutation.mutate({
                                  id: num.id,
                                  status: "active",
                                })
                              }
                            >
                              <Play className="mr-2 h-4 w-4" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() =>
                              updateStatusMutation.mutate({
                                id: num.id,
                                status: "retired",
                              })
                            }
                          >
                            <Ban className="mr-2 h-4 w-4" />
                            Retire
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
