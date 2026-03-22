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
  const [selectedStatus, setSelectedStatus] = useState('all');

  const { data: sequences = [], isLoading } = useQuery({
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
    
          
          Create Sequence
        
      }
    >
      
        {/* Stats Cards */}
        
          
            
              Total Sequences
              
            
            
              {stats.total}
              
                {stats.active} active
              
            
          

          
            
              Total Enrolled
              
            
            
              {stats.totalEnrolled}
              
                All-time contacts
              
            
          

          
            
              Active Enrollments
              
            
            
              {stats.activeEnrollments}
              
                Currently in progress
              
            
          

          
            
              Avg. Completion
              
            
            
              
                {stats.totalEnrolled > 0 
                  ? Math.round((sequences.reduce((sum, s) => sum + s.completedEnrollments, 0) / stats.totalEnrolled) * 100)
                  : 0}%
              
              
                Completion rate
              
            
          
        

        {/* Filter Tabs */}
        
           setSelectedStatus('all')}
            data-testid="filter-all"
          >
            All ({sequences.length})
          
           setSelectedStatus('active')}
            data-testid="filter-active"
          >
            Active ({sequences.filter(s => s.status === 'active').length})
          
           setSelectedStatus('paused')}
            data-testid="filter-paused"
          >
            Paused ({sequences.filter(s => s.status === 'paused').length})
          
           setSelectedStatus('archived')}
            data-testid="filter-archived"
          >
            Archived ({sequences.filter(s => s.status === 'archived').length})
          
        

        {/* Sequences Table */}
        
          
            Email Sequences
            
              Manage your automated email campaigns
            
          
          
            {isLoading ? (
              
                Loading sequences...
              
            ) : filteredSequences.length === 0 ? (
              
                
                
                  {selectedStatus === 'all' ? 'No sequences yet' : `No ${selectedStatus} sequences`}
                
                
                  Create your first automated email sequence to nurture leads
                
                
                  
                  Create Sequence
                
              
            ) : (
              
                
                  
                    
                      Name
                      Status
                      Enrolled
                      Active
                      Completed
                      Created
                      Actions
                    
                  
                  
                    {filteredSequences.map((sequence) => (
                      
                        
                          
                            {sequence.name}
                            {sequence.description && (
                              
                                {sequence.description}
                              
                            )}
                          
                        
                        
                          
                            {sequence.status === 'active' && }
                            {sequence.status === 'paused' && }
                            {sequence.status === 'archived' && }
                            {sequence.status}
                          
                        
                        
                          {sequence.totalEnrolled.toLocaleString()}
                        
                        
                          
                            {sequence.activeEnrollments.toLocaleString()}
                          
                        
                        
                          {sequence.completedEnrollments.toLocaleString()}
                        
                        
                          {new Date(sequence.createdAt).toLocaleDateString()}
                        
                        
                          
                             e.stopPropagation()}>
                              
                                
                              
                            
                            
                              
                                
                                View Details
                              
                              
                                
                                Edit
                              
                              
                                
                                View Analytics
                              
                              {sequence.status === 'active' ? (
                                
                                  
                                  Pause Sequence
                                
                              ) : sequence.status === 'paused' ? (
                                
                                  
                                  Resume Sequence
                                
                              ) : null}
                              
                                
                                Archive
                              
                            
                          
                        
                      
                    ))}
                  
                
              
            )}
          
        
      
    
  );
}