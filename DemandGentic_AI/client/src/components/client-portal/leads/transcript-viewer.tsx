import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, User, Bot, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TranscriptEntry {
  speaker: string;
  text: string;
  timestamp?: string;
}

interface TranscriptViewerProps {
  transcript: string;
  structuredTranscript?: TranscriptEntry[] | null;
}

export function TranscriptViewer({ transcript, structuredTranscript }: TranscriptViewerProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copyTranscript = () => {
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    toast({ title: 'Transcript copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  // Parse transcript into structured format if not already provided
  const entries: TranscriptEntry[] = structuredTranscript || parseTranscript(transcript);

  return (
    
      
        
          
          Call Transcript
        
        
          {copied ? (
            <>
              
              Copied
            
          ) : (
            <>
              
              Copy
            
          )}
        
      
      
        
          
            {entries.length > 0 ? (
              entries.map((entry, i) => (
                
              ))
            ) : (
              
                {transcript}
              
            )}
          
        
      
    
  );
}

function TranscriptMessage({ entry }: { entry: TranscriptEntry }) {
  const isAgent = entry.speaker.toLowerCase().includes('agent') ||
                  entry.speaker.toLowerCase().includes('ai') ||
                  entry.speaker.toLowerCase().includes('assistant');

  return (
    
      
        {isAgent ?  : }
      
      
        
          
            {entry.speaker}
          
          {entry.timestamp && (
            {entry.timestamp}
          )}
        
        
          {entry.text}
        
      
    
  );
}

function parseTranscript(transcript: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  // Common patterns for speaker labels
  const speakerPatterns = [
    /^(Agent|Contact|AI|Human|Customer|Representative|Caller|Receiver):\s*/im,
    /^\[?(Agent|Contact|AI|Human|Customer|Representative|Caller|Receiver)\]?:\s*/im,
  ];

  const lines = transcript.split('\n').filter(line => line.trim());
  let currentSpeaker = 'Speaker';
  let currentText: string[] = [];

  for (const line of lines) {
    let matched = false;

    for (const pattern of speakerPatterns) {
      const match = line.match(pattern);
      if (match) {
        // Save previous entry if exists
        if (currentText.length > 0) {
          entries.push({
            speaker: currentSpeaker,
            text: currentText.join(' ').trim(),
          });
          currentText = [];
        }

        currentSpeaker = match[1];
        const remaining = line.replace(pattern, '').trim();
        if (remaining) {
          currentText.push(remaining);
        }
        matched = true;
        break;
      }
    }

    if (!matched && line.trim()) {
      currentText.push(line.trim());
    }
  }

  // Don't forget the last entry
  if (currentText.length > 0) {
    entries.push({
      speaker: currentSpeaker,
      text: currentText.join(' ').trim(),
    });
  }

  // If parsing didn't work well (only one or no entries), return empty to show raw text
  if (entries.length <= 1) {
    return [];
  }

  return entries;
}