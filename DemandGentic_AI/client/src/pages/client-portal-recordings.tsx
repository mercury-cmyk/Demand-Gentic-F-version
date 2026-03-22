import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, Play, Loader2, Clock, Phone, AlertCircle } from "lucide-react";

const getToken = () => localStorage.getItem('clientPortalToken');

interface Recording {
  id: string;
  contactName: string;
  campaignName: string;
  durationSec: number;
  aiDisposition: string;
  recordingUrl: string;
  createdAt: string;
}

export default function ClientPortalRecordings() {
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [playingId, setPlayingId] = useState(null);

  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-recordings'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
  });

  const campaigns = [
    ...(campaignsData?.verificationCampaigns || []),
    ...(campaignsData?.regularCampaigns || []),
  ];

  const { data: recordings = [], isLoading } = useQuery({
    queryKey: ['client-portal-recordings', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/recordings?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch recordings');
      return res.json();
    },
  });

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    
      
        {/* Header */}
        
          
          
            
              
                
              
              Call Recordings
            
            Listen to and review call recordings from your campaigns
          
        

        {/* Campaign Filter */}
        
          
            
              Campaign
              
                
                  
                
                
                  All Campaigns
                  {campaigns.map((c: any) => (
                    {c.name}
                  ))}
                
              
            
          
        

        {/* Stats */}
        
          
            
              
                
                  
                
                
                  Total Recordings
                  {recordings.length}
                
              
            
          
          
            
              
                
                  
                
                
                  Total Duration
                  
                    {formatDuration(recordings.reduce((sum, r) => sum + (r.durationSec || 0), 0))}
                  
                
              
            
          
          
            
              
                
                  
                
                
                  Avg Duration
                  
                    {recordings.length > 0
                      ? formatDuration(Math.round(recordings.reduce((sum, r) => sum + (r.durationSec || 0), 0) / recordings.length))
                      : '0:00'}
                  
                
              
            
          
        

        {/* Recordings List */}
        
          
            Recordings
            {recordings.length} recordings available
          
          
            {isLoading ? (
              
                
              
            ) : recordings.length === 0 ? (
              
                
                No recordings available for your campaigns
              
            ) : (
              
                
                  
                    
                      Contact
                      Campaign
                      Disposition
                      Duration
                      Date
                      Play
                    
                  
                  
                    {recordings.map((rec) => (
                      
                        {rec.contactName || 'Unknown'}
                        
                          {rec.campaignName || '—'}
                        
                        
                          
                            {(rec.aiDisposition || 'unknown').replace(/_/g, ' ')}
                          
                        
                        
                          {formatDuration(rec.durationSec || 0)}
                        
                        
                          {rec.createdAt ? new Date(rec.createdAt).toLocaleDateString() : '—'}
                        
                        
                          {rec.recordingUrl ? (
                             setPlayingId(playingId === rec.id ? null : rec.id)}
                              className="gap-1"
                            >
                              
                              {playingId === rec.id ? 'Stop' : 'Play'}
                            
                          ) : (
                            No audio
                          )}
                        
                      
                    ))}
                  
                

                {/* Audio Player */}
                {playingId && (() => {
                  const rec = recordings.find(r => r.id === playingId);
                  return rec?.recordingUrl ? (
                    
                      
                        
                        {rec.contactName || 'Recording'}
                         setPlayingId(null)} />
                      
                    
                  ) : null;
                })()}
              
            )}
          
        
      
    
  );
}