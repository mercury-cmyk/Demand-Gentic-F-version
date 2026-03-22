'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'; // Assuming shadcn/ui
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
} from '@/components/ui/alert-dialog'; // Assuming shadcn/ui

// Define the type for a prompt, mirroring the Prisma model
type SystemPrompt = {
  id: string;
  agentName: string;
  promptText: string;
  version: number;
  isActive: boolean;
  createdAt: string; // Dates are serialized as strings
};

interface PromptHistoryClientProps {
  initialPrompts: SystemPrompt[];
  agentName: string;
}

export default function PromptHistoryClient({ initialPrompts, agentName }: PromptHistoryClientProps) {
  const [prompts, setPrompts] = useState(initialPrompts);
  const [isLoading, setIsLoading] = useState(false);

  const handleSetAsActive = async (promptId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/prompts/${promptId}/activate`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        throw new Error('Failed to activate prompt');
      }

      // Refetch the list to show the updated status
      const freshPromptsResponse = await fetch(`/api/prompts?agentName=${agentName}`);
      const freshPrompts = await freshPromptsResponse.json();
      setPrompts(freshPrompts);

    } catch (error) {
      console.error('Error activating prompt:', error);
      // In a real app, you would show a toast notification here
    } finally {
      setIsLoading(false);
    }
  };

  return (
    
      
        
          
            Version
            Status
            Created At
            Actions
          
        
        
          {prompts.map((prompt) => (
            
              v{prompt.version}
              
                {prompt.isActive ? Active : Inactive}
              
              {new Date(prompt.createdAt).toLocaleString()}
              
                
                  
                    View
                  
                  
                    Prompt v{prompt.version}
                    
                      {prompt.promptText}
                    
                  
                
                {!prompt.isActive && (
                  
                    Set as Active
                    
                      Are you sure?This will set version {prompt.version} as the active prompt for the '{agentName}' agent. The current active version will be deactivated.
                      Cancel handleSetAsActive(prompt.id)}>Confirm
                    
                  
                )}
              
            
          ))}
        
      
    
  );
}