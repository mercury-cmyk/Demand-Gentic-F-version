import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/patterns/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dropdown-menu";
import {
  Plus, Mail, Send, Users, TrendingUp, Pause, Play,
  MoreVertical, Edit, Archive, Eye, BarChart3, Clock, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailSequence {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'archived';
  mailboxAccountId: string;
  createdBy: string;
  totalEnrolled: number;
  activeEnrollments: number;
  completedEnrollments: number;
  createdAt: string;
  updatedAt: string;
}

export default function EmailSequencesPage() {
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'paused' | 'archived'>('all');

  const { data: sequences = [], isLoading } = useQuery<EmailSequence[]>({
    queryKey: ["/api/email-sequences"],
  });

  const filteredSequences = sequences.filter(seq => 
    selectedStatus === 'all' || seq.status === selectedStatus
  );

  const stats = {
    total: sequences.length,
    active: sequences.filter(s => s.status === 'active').length,
    totalEnrolled: sequences.reduce((sum, s) => sum + s.totalEnrolled, 0),
    activeEnrollments: sequences.reduce((sum, s) => sum + s.activeEnrollments, 0),
  };

  return (
    <PageShell
      title="Email Sequences"
      description="Automated multi-step email campaigns"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Marketing", href: "/marketing" },
        { label: "Email Sequences" },
      ]}
      actions={
        <Button data-testid="button-create-sequence">
          <Plus className="h-4 w-4 mr-2" />
          Create Sequence
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sequences</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.active} active
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-enrolled">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Enrolled</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEnrolled}</div>
              <p className="text-xs text-muted-foreground mt-1">
                All-time contacts
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-active">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Enrollments</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeEnrollments}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Currently in progress
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-performance">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Completion</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.totalEnrolled > 0 
                  ? Math.round((sequences.reduce((sum, s) => sum + s.completedEnrollments, 0) / stats.totalEnrolled) * 100)
                  : 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Completion rate
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2">
          <Button
            variant={selectedStatus === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedStatus('all')}
            data-testid="filter-all"
          >
            All ({sequences.length})
          </Button>
          <Button
            variant={selectedStatus === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedStatus('active')}
            data-testid="filter-active"
          >
            Active ({sequences.filter(s => s.status === 'active').length})
          </Button>
          <Button
            variant={selectedStatus === 'paused' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedStatus('paused')}
            data-testid="filter-paused"
          >
            Paused ({sequences.filter(s => s.status === 'paused').length})
          </Button>
          <Button
            variant={selectedStatus === 'archived' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedStatus('archived')}
            data-testid="filter-archived"
          >
            Archived ({sequences.filter(s => s.status === 'archived').length})
          </Button>
        </div>

        {/* Sequences Table */}
        <Card>
          <CardHeader>
            <CardTitle>Email Sequences</CardTitle>
            <CardDescription>
              Manage your automated email campaigns
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground">Loading sequences...</div>
              </div>
            ) : filteredSequences.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">
                  {selectedStatus === 'all' ? 'No sequences yet' : `No ${selectedStatus} sequences`}
                </h3>
                <p className="text-muted-foreground mb-4">
                  Create your first automated email sequence to nurture leads
                </p>
                <Button data-testid="button-create-first-sequence">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Sequence
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Enrolled</TableHead>
                      <TableHead className="text-right">Active</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                      <TableHead className="text-right">Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSequences.map((sequence) => (
                      <TableRow 
                        key={sequence.id}
                        className="cursor-pointer hover-elevate"
                        data-testid={`row-sequence-${sequence.id}`}
                      >
                        <TableCell>
                          <div>
                            <div className="font-medium">{sequence.name}</div>
                            {sequence.description && (
                              <div className="text-sm text-muted-foreground line-clamp-1">
                                {sequence.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              sequence.status === 'active' ? 'default' :
                              sequence.status === 'paused' ? 'secondary' : 'outline'
                            }
                            className="capitalize"
                          >
                            {sequence.status === 'active' && <Play className="h-3 w-3 mr-1" />}
                            {sequence.status === 'paused' && <Pause className="h-3 w-3 mr-1" />}
                            {sequence.status === 'archived' && <Archive className="h-3 w-3 mr-1" />}
                            {sequence.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {sequence.totalEnrolled.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">
                            {sequence.activeEnrollments.toLocaleString()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {sequence.completedEnrollments.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {new Date(sequence.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-8 w-8"
                                data-testid={`button-menu-${sequence.id}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <BarChart3 className="h-4 w-4 mr-2" />
                                View Analytics
                              </DropdownMenuItem>
                              {sequence.status === 'active' ? (
                                <DropdownMenuItem>
                                  <Pause className="h-4 w-4 mr-2" />
                                  Pause Sequence
                                </DropdownMenuItem>
                              ) : sequence.status === 'paused' ? (
                                <DropdownMenuItem>
                                  <Play className="h-4 w-4 mr-2" />
                                  Resume Sequence
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem>
                                <Archive className="h-4 w-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
