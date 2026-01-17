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
  const [prompts, setPrompts] = useState<SystemPrompt[]>(initialPrompts);
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
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prompts.map((prompt) => (
            <TableRow key={prompt.id}>
              <TableCell className="font-medium">v{prompt.version}</TableCell>
              <TableCell>
                {prompt.isActive ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
              </TableCell>
              <TableCell>{new Date(prompt.createdAt).toLocaleString()}</TableCell>
              <TableCell className="text-right space-x-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">View</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader><DialogTitle>Prompt v{prompt.version}</DialogTitle></DialogHeader>
                    <div className="prose max-w-none p-4 bg-gray-50 rounded-md max-h-[60vh] overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm font-sans">{prompt.promptText}</pre>
                    </div>
                  </DialogContent>
                </Dialog>
                {!prompt.isActive && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button size="sm" disabled={isLoading}>Set as Active</Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will set version {prompt.version} as the active prompt for the '{agentName}' agent. The current active version will be deactivated.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleSetAsActive(prompt.id)}>Confirm</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}