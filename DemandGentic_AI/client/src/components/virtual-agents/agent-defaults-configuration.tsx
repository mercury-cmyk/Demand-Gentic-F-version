/**
 * Global Agent Defaults Configuration Component
 * 
 * Allows administrators to manage centralized default settings for all virtual agents.
 * These defaults are automatically inherited by new agents unless overridden.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, RotateCcw, Settings, Info, CheckCircle2, AlertCircle, PhoneCall } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface AgentDefaults {
  id: string | null;
  defaultFirstMessage: string;
  defaultSystemPrompt: string;
  defaultTrainingGuidelines: string[];
  defaultVoiceProvider: string;
  defaultVoice: string;
  defaultMaxConcurrentCalls: number;
  globalMaxConcurrentCalls: number;
  isSystemDefault: boolean;
  updatedAt: string | null;
}

export function AgentDefaultsConfiguration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [firstMessage, setFirstMessage] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [trainingGuidelines, setTrainingGuidelines] = useState([]);
  const [voiceProvider, setVoiceProvider] = useState('openai');
  const [voice, setVoice] = useState('Kore');
  const [defaultMaxConcurrentCalls, setDefaultMaxConcurrentCalls] = useState(100);
  const [globalMaxConcurrentCalls, setGlobalMaxConcurrentCalls] = useState(100);
  const [newGuideline, setNewGuideline] = useState('');

  // Fetch current defaults
  const { data: defaults, isLoading } = useQuery({
    queryKey: ['/api/agent-defaults'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/agent-defaults');
      return res.json();
    },
  });

  // Populate form when defaults are loaded
  useEffect(() => {
    if (defaults) {
      setFirstMessage(defaults.defaultFirstMessage);
      setSystemPrompt(defaults.defaultSystemPrompt);
      setTrainingGuidelines(defaults.defaultTrainingGuidelines);
      setVoiceProvider(defaults.defaultVoiceProvider);
      setVoice(defaults.defaultVoice);
      setDefaultMaxConcurrentCalls(defaults.defaultMaxConcurrentCalls ?? 100);
      setGlobalMaxConcurrentCalls(defaults.globalMaxConcurrentCalls ?? 100);
    }
  }, [defaults]);

  // Update defaults mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PUT', '/api/agent-defaults', {
        defaultFirstMessage: firstMessage,
        defaultSystemPrompt: systemPrompt,
        defaultTrainingGuidelines: trainingGuidelines,
        defaultVoiceProvider: voiceProvider,
        defaultVoice: voice,
        defaultMaxConcurrentCalls,
        globalMaxConcurrentCalls,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/agent-defaults'] });
      toast({
        title: 'Defaults updated',
        description: 'Global agent defaults have been saved successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Reset to system defaults mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/agent-defaults/reset', {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/agent-defaults'] });
      setFirstMessage(data.defaultFirstMessage);
      setSystemPrompt(data.defaultSystemPrompt);
      setTrainingGuidelines(data.defaultTrainingGuidelines);
      setVoiceProvider(data.defaultVoiceProvider);
      setVoice(data.defaultVoice);
      setDefaultMaxConcurrentCalls(data.defaultMaxConcurrentCalls ?? 100);
      setGlobalMaxConcurrentCalls(data.globalMaxConcurrentCalls ?? 100);
      toast({
        title: 'Reset complete',
        description: 'Global agent defaults have been reset to system defaults.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Reset failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const addGuideline = () => {
    if (newGuideline.trim()) {
      setTrainingGuidelines([...trainingGuidelines, newGuideline.trim()]);
      setNewGuideline('');
    }
  };

  const removeGuideline = (index: number) => {
    setTrainingGuidelines(trainingGuidelines.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      
        
          
            
          
        
      
    );
  }

  return (
    
      {/* Header */}
      
        
          
            
              
                
                Global Agent Defaults
              
              
                Define baseline settings that all virtual agents inherit automatically
              
            
            
              {defaults?.isSystemDefault && (
                
                  
                  System Defaults
                
              )}
              {defaults && !defaults.isSystemDefault && defaults.updatedAt && (
                
                  Last updated: {new Date(defaults.updatedAt).toLocaleDateString()}
                
              )}
            
          
        
        
          
            
            
              
                How Defaults Work
              
              
                These settings are automatically applied to all new agents. Individual agents can override
                these defaults if needed. Changes here affect all future agents but do not modify existing agents.
              
            
          
        
      

      {/* Default Opening Message */}
      
        
          Default Opening Message
          
            The first message agents use when starting a conversation
          
        
        
          
            Opening Message Template
             setFirstMessage(e.target.value)}
              placeholder="Hi, may I speak with {{contact.full_name}}..."
              rows={3}
              className="font-mono text-sm"
            />
            
              Use template variables: {'{{contact.full_name}}'},{' '}
              {'{{contact.job_title}}'},{' '}
              {'{{account.name}}'}
            
          
        
      

      {/* Default System Prompt */}
      
        
          Default System Prompt Structure
          
            The foundational prompt that defines how agents think and behave
          
        
        
          
            System Prompt
             setSystemPrompt(e.target.value)}
              placeholder="# Personality\n\nYou are a professional..."
              rows={12}
              className="font-mono text-sm"
            />
            
              This prompt defines the agent's personality, environment, tone, and behavioral framework.
              It is applied to all agents automatically.
            
          
        
      

      {/* Training Guidelines */}
      
        
          Default Training Guidelines
          
            Behavioral constraints and best practices applied to all agents
          
        
        
          
            {trainingGuidelines.map((guideline, index) => (
              
                
                {guideline}
                 removeGuideline(index)}
                  className="h-6 w-6 p-0"
                >
                  ×
                
              
            ))}
          

          
             setNewGuideline(e.target.value)}
              placeholder="Add a new training guideline..."
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addGuideline();
                }
              }}
            />
            
              Add
            
          
        
      

      {/* Default Voice Configuration */}
      
        
          Default Voice Configuration
          
            Default voice provider and voice selection for new agents
          
        
        
          
            
              Voice Provider
              
                
                  
                
                
                  Google Gemini (Recommended)
                  OpenAI Realtime
                
              
            
            
              Default Voice
              
                
                  
                
                
                  {voiceProvider === 'google' ? (
                    <>
                      Puck - Upbeat & energetic
                      Kore - Soft & friendly (Recommended)
                      Charon - Deep & authoritative
                      Fenrir - Calm & measured
                      Aoede - Bright & energetic
                      Leda - Professional & articulate
                      Orus - Warm & conversational
                      Zephyr - Light & modern
                      Pegasus - Calm & professional
                    
                  ) : (
                    <>
                      Ash - Clear & professional
                      Verse - Poetic & dynamic
                      Ballad - Warm & storytelling
                      Echo - Deep & resonant
                      Coral - Warm & friendly
                      Sage - Calm & wise
                      Shimmer - Expressive & clear
                      Marin - Calm & professional
                      Alloy - Neutral & balanced
                      Nova - Friendly & upbeat
                    
                  )}
                
              
            
          
        
      

      {/* Concurrent Call Limits */}
      
        
          
            
            Concurrent Call Limits
          
          
            Control how many simultaneous calls can run per campaign and system-wide
          
        
        
          
            
              Per-Campaign Default
               setDefaultMaxConcurrentCalls(Math.max(1, parseInt(e.target.value) || 1))}
              />
              
                Maximum concurrent calls each campaign can make unless overridden in campaign settings.
              
            
            
              System-Wide Maximum
               setGlobalMaxConcurrentCalls(Math.max(1, parseInt(e.target.value) || 1))}
              />
              
                Total concurrent calls across all campaigns combined (Telnyx capacity limit).
              
            
          
          
            
            
              Setting these too high may exceed your telephony provider's capacity. The system-wide max
              caps the total across all active campaigns, while per-campaign default limits each campaign individually.
              Individual campaigns can override the per-campaign default in their AI settings.
            
          
        
      

      {/* Actions */}
      
        
          
            
              
                
                  
                  Reset to System Defaults
                
              
              
                
                  Reset to System Defaults?
                  
                    This will restore all settings to the original system defaults. Any custom
                    configurations you've made will be lost. This action cannot be undone.
                  
                
                
                  Cancel
                   resetMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Reset to Defaults
                  
                
              
            

             updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  
                  Saving...
                
              ) : (
                <>
                  
                  Save Global Defaults
                
              )}
            
          
        
      
    
  );
}