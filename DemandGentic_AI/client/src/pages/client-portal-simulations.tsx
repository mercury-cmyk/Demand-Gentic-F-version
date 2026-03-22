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
  const [selectedSimulation, setSelectedSimulation] = useState(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  // Fetch approved simulations
  const { data: simulations, isLoading } = useQuery({
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
      
        
      
    );
  }

  return (
    
      {/* Header */}
      
        Simulations
        
          View approved call simulations and transcripts
        
      

      {/* Stats Cards */}
      
        
          
            Total Simulations
            {stats.total}
          
          
            
              
              QA Approved
            
          
        

        
          
            Average Duration
            
              {formatDuration(stats.avgDuration)}
            
          
          
            
              
              Minutes per simulation
            
          
        

        
          
            Average QA Score
            {stats.avgScore}%
          
          
            
              
              Quality assessment
            
          
        
      

      {/* Search and Filters */}
      
        
          
            Simulation Library
            
              
               setSearchTerm(e.target.value)}
                className="pl-8"
              />
            
          
        
        
          {filteredSimulations.length === 0 ? (
            
              
              No simulations found
              {searchTerm && (
                Try adjusting your search terms
              )}
            
          ) : (
            
              
                
                  Session Name
                  Campaign
                  Project
                  Duration
                  QA Score
                  Date
                  Actions
                
              
              
                {filteredSimulations.map((simulation) => (
                  
                    
                      {simulation.sessionName || `Session ${simulation.id.slice(0, 8)}`}
                    
                    
                      {simulation.campaignName || (
                        —
                      )}
                    
                    
                      {simulation.projectName || (
                        —
                      )}
                    
                    
                      
                        
                        {formatDuration(simulation.durationSeconds)}
                      
                    
                    
                      {simulation.qaScore ? (
                        = 85
                              ? "bg-green-100 text-green-700 border-green-200"
                              : simulation.qaScore >= 70
                              ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                              : "bg-orange-100 text-orange-700 border-orange-200"
                          }
                        >
                          {simulation.qaScore}%
                        
                      ) : (
                        —
                      )}
                    
                    
                      
                        
                        {format(new Date(simulation.createdAt), "MMM d, yyyy")}
                      
                    
                    
                      
                         handleViewSimulation(simulation)}
                        >
                          
                          View
                        
                         handleExportTranscript(simulation)}
                        >
                          
                        
                      
                    
                  
                ))}
              
            
          )}
        
      

      {/* Simulation View Dialog */}
      
        
          
            
              {selectedSimulation?.sessionName ||
                `Simulation ${selectedSimulation?.id?.slice(0, 8)}`}
            
            
              
                {selectedSimulation?.campaignName && (
                  Campaign: {selectedSimulation.campaignName}
                )}
                {selectedSimulation?.durationSeconds && (
                  
                    
                    {formatDuration(selectedSimulation.durationSeconds)}
                  
                )}
                {selectedSimulation?.qaScore && (
                  = 85
                        ? "bg-green-100 text-green-700 border-green-200"
                        : selectedSimulation.qaScore >= 70
                        ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                        : "bg-orange-100 text-orange-700 border-orange-200"
                    }
                  >
                    QA Score: {selectedSimulation.qaScore}%
                  
                )}
              
            
          

          
            
              Transcript
              Summary
            

            
              
                
                  {selectedSimulation?.transcript?.map((message, index) => (
                    
                      
                        {message.role === "assistant" ? (
                          
                        ) : message.role === "system" ? (
                          
                        ) : (
                          
                        )}
                      
                      
                        
                          {message.role}
                          {message.timestamp && (
                            
                              {format(new Date(message.timestamp), "h:mm a")}
                            
                          )}
                        
                        
                          {message.content}
                        
                      
                    
                  ))}
                
              
            

            
              
                
                  
                    
                      Session Overview
                      
                        
                          
                            Total Messages:
                          {" "}
                          {selectedSimulation?.transcript?.length || 0}
                        
                        
                          
                            Duration:
                          {" "}
                          {formatDuration(
                            selectedSimulation?.durationSeconds || 0
                          )}
                        
                        
                          
                            QA Status:
                          {" "}
                          
                            Approved
                          
                        
                        
                          Date:{" "}
                          {selectedSimulation?.createdAt &&
                            format(
                              new Date(selectedSimulation.createdAt),
                              "MMMM d, yyyy 'at' h:mm a"
                            )}
                        
                      
                    

                    
                      
                          selectedSimulation &&
                          handleExportTranscript(selectedSimulation)
                        }
                      >
                        
                        Export Transcript
                      
                    
                  
                
              
            
          
        
      
    
  );
}