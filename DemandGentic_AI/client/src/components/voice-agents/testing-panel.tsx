/**
 * Voice Agent Testing Panel
 *
 * Quick test functionality and Preview Studio integration for virtual agents.
 * Shows recent test results and provides quick testing actions.
 * 
 * Includes TRUE SIMULATION mode that bypasses all telephony.
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Phone,
  PhoneCall,
  Play,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Mic,
  Loader2,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';

interface TestResult {
  id: string;
  agentId: string;
  status: 'passed' | 'failed' | 'warning';
  timestamp: string;
  duration: number;
  summary: string;
  details?: string;
}

export interface TestingPanelProps {
  agentId: string;
  agentName: string;
  className?: string;
}

export function TestingPanel({ agentId, agentName, className }: TestingPanelProps) {
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [testMode, setTestMode] = useState('simulation');
  const [selectedPersona, setSelectedPersona] = useState('neutral_dm');
  const [simulationResult, setSimulationResult] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();

  // Fetch available personas
  const { data: personasData } = useQuery({
    queryKey: ['/api/simulations/personas'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/simulations/personas');
      return res.json();
    },
    enabled: !!token,
  });

  const personas = personasData?.personas || [];

  // Fetch recent test results (mock data for now)
  const { data: testResults = [], isLoading: resultsLoading } = useQuery({
    queryKey: ['/api/virtual-agents', agentId, 'test-results'],
    queryFn: async () => {
      // Mock test results - replace with actual API call
      return [
        {
          id: '1',
          agentId,
          status: 'passed',
          timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          duration: 45,
          summary: 'Opening and qualification successful',
        },
        {
          id: '2',
          agentId,
          status: 'warning',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          duration: 62,
          summary: 'Handled objection but missed opportunity',
        },
        {
          id: '3',
          agentId,
          status: 'passed',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
          duration: 38,
          summary: 'Successful cold call simulation',
        },
      ];
    },
    enabled: !!agentId && !!token,
  });

  // Start test call mutation (for LIVE mode)
  const startTestCallMutation = useMutation({
    mutationFn: async ({ agentId, phoneNumber }: { agentId: string; phoneNumber?: string }) => {
      return await apiRequest('POST', '/api/test-calls/start', {
        agentId,
        phoneNumber,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Test Call Started',
        description: 'The test call is being initiated.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/virtual-agents', agentId, 'test-results'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Test Failed',
        description: error.message || 'Failed to start test call',
        variant: 'destructive',
      });
    },
  });

  // TRUE SIMULATION - No telephony
  const startSimulationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/simulations/start', {
        campaignId: null, // Will use default campaign context
        accountId: null,  // Will use default account context
        virtualAgentId: agentId,
        personaPreset: selectedPersona,
        maxTurns: 12,
        runFullSimulation: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSimulationResult(data.session);
      toast({
        title: 'Simulation Complete',
        description: `Score: ${data.session.evaluation?.overallScore || 0}/100`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/virtual-agents', agentId, 'test-results'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Simulation Failed',
        description: error.message || 'Failed to run simulation',
        variant: 'destructive',
      });
    },
  });

  const handleQuickTest = () => {
    if (testMode === 'simulation') {
      startSimulationMutation.mutate();
    } else {
      startTestCallMutation.mutate({ agentId });
    }
  };

  const handlePhoneTest = () => {
    if (!testPhoneNumber) {
      toast({
        title: 'Phone Number Required',
        description: 'Please enter a phone number for the test call',
        variant: 'destructive',
      });
      return;
    }
    startTestCallMutation.mutate({ agentId, phoneNumber: testPhoneNumber });
  };

  const StatusIcon = ({ status }: { status: TestResult['status'] }) => {
    switch (status) {
      case 'passed':
        return ;
      case 'failed':
        return ;
      case 'warning':
        return ;
    }
  };

  return (
    
      
        
          
          Agent Testing
        
        Test {agentName} with quick simulations or real calls
      
      
        {/* Test Mode Toggle */}
         setTestMode(v as 'simulation' | 'phone')}>
          
            
              
              Simulation
            
            
              
              Live Call
            
          

          
            {/* Simulation Mode - NO PHONE REQUIRED */}
            
              
                
                No Phone Required
              
              
                True simulation - bypasses all telephony
              
            

            {/* Persona Selection */}
            
              
                
                Simulated Human
              
              
                
                  
                
                
                  {personas.length > 0 ? personas.map((p) => (
                    
                      {p.name}
                      {p.disposition}
                    
                  )) : (
                    <>
                      Friendly Decision Maker
                      Skeptical Decision Maker
                      Hostile Decision Maker
                      Gatekeeper (Assistant)
                    
                  )}
                
              
            

            
              {startSimulationMutation.isPending ? (
                
              ) : (
                
              )}
              Run Simulation
            

            {/* Simulation Result */}
            {simulationResult?.evaluation && (
              
                
                  Last Result
                  = 70 ? 'default' : 'secondary'}>
                    {simulationResult.evaluation.overallScore}/100
                  
                
                
                  {simulationResult.transcript?.length || 0} turns • {simulationResult.evaluation.conversationStages?.join(' → ')}
                
              
            )}
          

          
            {/* Phone Test Mode - LIVE */}
            
              
                Live mode requires a phone number and uses real telephony.
              
            

            {/* Real Phone Test */}
            
              Phone Number
              
                 setTestPhoneNumber(e.target.value)}
                  type="tel"
                />
                
                  
                  Call
                
              
            
          
        

        {/* Quick Actions */}
        
          
            
              
              Preview Studio
              Full testing suite with all modes
            
          
        

        {/* REMOVED: Old phone test section - now in tabs above */}

        {/* Recent Test Results */}
        
          
            Recent Results
            
              
                View All
                
              
            
          

          {resultsLoading ? (
            
              
              
            
          ) : testResults.length === 0 ? (
            
              
              No test results yet
              Run a quick test to get started
            
          ) : (
            
              
                {testResults.map(result => (
                  
                    
                    
                      {result.summary}
                      
                        {format(new Date(result.timestamp), 'MMM d, h:mm a')}
                        •
                        {result.duration}s duration
                      
                    
                    
                      {result.status}
                    
                  
                ))}
              
            
          )}
        

        {/* Testing Tips */}
        
          Testing Tips
          
            • Use Quick Test for basic functionality validation
            • Preview Studio offers scenario-based testing
            • Real phone tests verify SIP and voice quality
          
        
      
    
  );
}