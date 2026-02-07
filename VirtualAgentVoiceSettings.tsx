import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Info } from "lucide-react";

interface Voice {
  id: string;
  name: string;
  description: string;
}

export function VirtualAgentVoiceSettings({ agent, onUpdate }: any) {
  const [provider, setProvider] = useState(agent?.provider || 'openai');
  const [voice, setVoice] = useState(agent?.voice || '');
  const [geminiVoices, setGeminiVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [isManualVoice, setIsManualVoice] = useState(false);

  useEffect(() => {
    if (provider === 'google') {
      fetchGeminiVoices();
    }
  }, [provider]);

  const fetchGeminiVoices = async () => {
    setLoadingVoices(true);
    try {
      const res = await fetch('/api/ai-calls/gemini-voices');
      const data = await res.json();
      setGeminiVoices(data);
    } catch (error) {
      console.error("Failed to fetch Gemini voices", error);
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleProviderChange = (val: string) => {
    setProvider(val);
    setVoice(''); // Reset voice when provider changes
    onUpdate({ provider: val, voice: '' });
  };

  const handleVoiceChange = (val: string) => {
    setVoice(val);
    onUpdate({ voice: val });
  };

  return (
    <div className="space-y-6 p-4 border rounded-lg bg-card">
      <div className="space-y-2">
        <Label>AI Voice Provider</Label>
        <Select value={provider} onValueChange={handleProviderChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI Realtime</SelectItem>
            <SelectItem value="google">Live Voice</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Voice Selection</Label>
          <div className="flex items-center space-x-2">
            <Label htmlFor="manual-voice" className="text-xs text-muted-foreground">Custom Voice Name</Label>
            <Switch 
              id="manual-voice" 
              checked={isManualVoice} 
              onCheckedChange={setIsManualVoice} 
            />
          </div>
        </div>

        {isManualVoice ? (
          <div className="space-y-2">
            <Input 
              placeholder="Enter voice name (e.g. Jade)" 
              value={voice}
              onChange={(e) => handleVoiceChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="w-3 h-3" />
              Use this to try new Google voices as soon as they are released.
            </p>
          </div>
        ) : (
          provider === 'google' ? (
            <Select value={voice} onValueChange={handleVoiceChange} disabled={loadingVoices}>
              <SelectTrigger>
                {loadingVoices ? <Loader2 className="w-4 h-4 animate-spin" /> : <SelectValue placeholder="Select Voice" />}
              </SelectTrigger>
              <SelectContent>
                {geminiVoices.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} <span className="text-xs text-muted-foreground ml-2">({v.description})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={voice} onValueChange={handleVoiceChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select OpenAI Voice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alloy">Alloy (Neutral)</SelectItem>
                <SelectItem value="echo">Echo (Male)</SelectItem>
                <SelectItem value="shimmer">Shimmer (Female)</SelectItem>
                <SelectItem value="ash">Ash</SelectItem>
                <SelectItem value="ballad">Ballad</SelectItem>
                <SelectItem value="coral">Coral</SelectItem>
                <SelectItem value="sage">Sage</SelectItem>
                <SelectItem value="verse">Verse</SelectItem>
              </SelectContent>
            </Select>
          )
        )}
      </div>
    </div>
  );
}
