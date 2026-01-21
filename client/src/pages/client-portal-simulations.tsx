/**
 * Client Portal Simulations Page
 * Displays QA-approved simulations for client viewing
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Play,
  Clock,
  Calendar,
  MessageSquare,
  User,
  Bot,
  ChevronRight,
  Download,
  FileText,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";

interface SimulationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

interface Simulation {
  id: string;
  sessionName: string;
  campaignId: string;
  campaignName?: string;
  projectId?: string;
  projectName?: string;
  transcript: SimulationMessage[];
  durationSeconds: number;
  createdAt: string;
  qaScore?: number;
  qaStatus: string;
}

export default function ClientPortalSimulations() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSimulation, setSelectedSimulation] = useState<Simulation | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  // Fetch approved simulations
  const { data: simulations, isLoading } = useQuery<Simulation[]>({
    queryKey: ["/api/client-portal/simulations"],
  });

  // Filter simulations based on search
  const filteredSimulations = simulations?.filter((sim) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      sim.sessionName?.toLowerCase().includes(searchLower) ||
      sim.campaignName?.toLowerCase().includes(searchLower) ||
      sim.projectName?.toLowerCase().includes(searchLower)
    );
  }) || [];

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // View simulation details
  const handleViewSimulation = (simulation: Simulation) => {
    setSelectedSimulation(simulation);
    setViewDialogOpen(true);
  };

  // Export transcript
  const handleExportTranscript = (simulation: Simulation) => {
    const content = simulation.transcript
      .map((msg) => `[${msg.role.toUpperCase()}]: ${msg.content}`)
      .join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation-${simulation.id}-transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Calculate stats
  const stats = {
    total: simulations?.length || 0,
    avgDuration: simulations?.length
      ? Math.round(
          simulations.reduce((sum, s) => sum + s.durationSeconds, 0) /
            simulations.length
        )
      : 0,
    avgScore: simulations?.length
      ? Math.round(
          simulations
            .filter((s) => s.qaScore)
            .reduce((sum, s) => sum + (s.qaScore || 0), 0) /
            simulations.filter((s) => s.qaScore).length
        )
      : 0,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Simulations</h1>
        <p className="text-muted-foreground">
          View approved call simulations and transcripts
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Simulations</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
              QA Approved
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Duration</CardDescription>
            <CardTitle className="text-3xl">
              {formatDuration(stats.avgDuration)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <Clock className="h-4 w-4 mr-1" />
              Minutes per simulation
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average QA Score</CardDescription>
            <CardTitle className="text-3xl">{stats.avgScore}%</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <FileText className="h-4 w-4 mr-1" />
              Quality assessment
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Simulation Library</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search simulations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredSimulations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No simulations found</p>
              {searchTerm && (
                <p className="text-sm">Try adjusting your search terms</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session Name</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>QA Score</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSimulations.map((simulation) => (
                  <TableRow key={simulation.id}>
                    <TableCell className="font-medium">
                      {simulation.sessionName || `Session ${simulation.id.slice(0, 8)}`}
                    </TableCell>
                    <TableCell>
                      {simulation.campaignName || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {simulation.projectName || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Clock className="h-3 w-3 mr-1 text-muted-foreground" />
                        {formatDuration(simulation.durationSeconds)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {simulation.qaScore ? (
                        <Badge
                          variant="outline"
                          className={
                            simulation.qaScore >= 85
                              ? "bg-green-100 text-green-700 border-green-200"
                              : simulation.qaScore >= 70
                              ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                              : "bg-orange-100 text-orange-700 border-orange-200"
                          }
                        >
                          {simulation.qaScore}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center text-muted-foreground">
                        <Calendar className="h-3 w-3 mr-1" />
                        {format(new Date(simulation.createdAt), "MMM d, yyyy")}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewSimulation(simulation)}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExportTranscript(simulation)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Simulation View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedSimulation?.sessionName ||
                `Simulation ${selectedSimulation?.id?.slice(0, 8)}`}
            </DialogTitle>
            <DialogDescription>
              <div className="flex items-center gap-4 mt-2">
                {selectedSimulation?.campaignName && (
                  <span>Campaign: {selectedSimulation.campaignName}</span>
                )}
                {selectedSimulation?.durationSeconds && (
                  <span className="flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatDuration(selectedSimulation.durationSeconds)}
                  </span>
                )}
                {selectedSimulation?.qaScore && (
                  <Badge
                    variant="outline"
                    className={
                      selectedSimulation.qaScore >= 85
                        ? "bg-green-100 text-green-700 border-green-200"
                        : selectedSimulation.qaScore >= 70
                        ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                        : "bg-orange-100 text-orange-700 border-orange-200"
                    }
                  >
                    QA Score: {selectedSimulation.qaScore}%
                  </Badge>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="transcript" className="mt-4">
            <TabsList>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="summary">Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="transcript">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {selectedSimulation?.transcript?.map((message, index) => (
                    <div
                      key={index}
                      className={`flex gap-3 ${
                        message.role === "assistant" ? "flex-row-reverse" : ""
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                          message.role === "assistant"
                            ? "bg-primary text-primary-foreground"
                            : message.role === "system"
                            ? "bg-muted text-muted-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {message.role === "assistant" ? (
                          <Bot className="h-4 w-4" />
                        ) : message.role === "system" ? (
                          <FileText className="h-4 w-4" />
                        ) : (
                          <User className="h-4 w-4" />
                        )}
                      </div>
                      <div
                        className={`flex-1 rounded-lg p-3 ${
                          message.role === "assistant"
                            ? "bg-primary/10 text-right"
                            : message.role === "system"
                            ? "bg-muted"
                            : "bg-secondary"
                        }`}
                      >
                        <p className="text-xs text-muted-foreground mb-1 capitalize">
                          {message.role}
                          {message.timestamp && (
                            <span className="ml-2">
                              {format(new Date(message.timestamp), "h:mm a")}
                            </span>
                          )}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="summary">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Session Overview</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            Total Messages:
                          </span>{" "}
                          {selectedSimulation?.transcript?.length || 0}
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Duration:
                          </span>{" "}
                          {formatDuration(
                            selectedSimulation?.durationSeconds || 0
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            QA Status:
                          </span>{" "}
                          <Badge
                            variant="outline"
                            className="bg-green-100 text-green-700"
                          >
                            Approved
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Date:</span>{" "}
                          {selectedSimulation?.createdAt &&
                            format(
                              new Date(selectedSimulation.createdAt),
                              "MMMM d, yyyy 'at' h:mm a"
                            )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={() =>
                          selectedSimulation &&
                          handleExportTranscript(selectedSimulation)
                        }
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export Transcript
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
