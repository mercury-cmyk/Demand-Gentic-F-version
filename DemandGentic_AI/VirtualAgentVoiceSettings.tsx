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
  const [geminiVoices, setGeminiVoices] = useState([]);
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
    
      
        AI Voice Provider
        
          
            
          
          
            OpenAI Realtime
            Live Voice
          
        
      

      
        
          Voice Selection
          
            Custom Voice Name
            
          
        

        {isManualVoice ? (
          
             handleVoiceChange(e.target.value)}
            />
            
              
              Use this to try new Google voices as soon as they are released.
            
          
        ) : (
          provider === 'google' ? (
            
              
                {loadingVoices ?  : }
              
              
                {geminiVoices.map((v) => (
                  
                    {v.name} ({v.description})
                  
                ))}
              
            
          ) : (
            
              
                
              
              
                Alloy (Neutral)
                Echo (Male)
                Shimmer (Female)
                Ash
                Ballad
                Coral
                Sage
                Verse
              
            
          )
        )}
      
    
  );
}