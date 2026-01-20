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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Call Transcript
        </CardTitle>
        <Button variant="outline" size="sm" onClick={copyTranscript}>
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2 text-green-600" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {entries.length > 0 ? (
              entries.map((entry, i) => (
                <TranscriptMessage key={i} entry={entry} />
              ))
            ) : (
              <div className="whitespace-pre-wrap text-sm text-muted-foreground font-mono">
                {transcript}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function TranscriptMessage({ entry }: { entry: TranscriptEntry }) {
  const isAgent = entry.speaker.toLowerCase().includes('agent') ||
                  entry.speaker.toLowerCase().includes('ai') ||
                  entry.speaker.toLowerCase().includes('assistant');

  return (
    <div className={`flex gap-3 ${isAgent ? '' : 'flex-row-reverse'}`}>
      <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
        isAgent ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
      }`}>
        {isAgent ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </div>
      <div className={`flex-1 max-w-[80%] ${isAgent ? '' : 'flex flex-col items-end'}`}>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs">
            {entry.speaker}
          </Badge>
          {entry.timestamp && (
            <span className="text-xs text-muted-foreground">{entry.timestamp}</span>
          )}
        </div>
        <div className={`rounded-lg p-3 text-sm ${
          isAgent
            ? 'bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100'
            : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
        }`}>
          {entry.text}
        </div>
      </div>
    </div>
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
